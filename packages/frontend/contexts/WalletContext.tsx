'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node'
import type { Wallet, Aliased } from '@aztec/aztec.js/wallet'
import { AztecAddress } from '@aztec/stdlib/aztec-address'
import { Fr } from '@aztec/foundation/fields'
import type { EmbeddedWallet } from '@/lib/wallet/embeddedWallet'
import { registerPublicContracts } from '@/lib/contract'
import { NocomPublicContracts } from '@/lib/types'
import { NocomEscrowV1Contract, NocomEscrowV1ContractArtifact } from '@nocom-v1/contracts/artifacts'
import { ContractInstanceWithAddressSchema } from '@aztec/stdlib/contract'
import { simulationQueue } from '@/lib/utils/simulationQueue'
import { getEscrowMappings } from '@/lib/storage/escrowStorage'

export type WalletStatus = 'disconnected' | 'connecting' | 'connected'
export type WalletProviderType = 'embedded' | 'extension'

export type WalletAccount = {
  address: string
  label: string
}

type WalletHandle =
  | { type: 'embedded'; instance: EmbeddedWallet }
  | { type: 'extension'; instance: Wallet }

export type WalletContextValue = {
  status: WalletStatus
  providerType?: WalletProviderType
  accounts: WalletAccount[]
  activeAccount?: WalletAccount
  wallet?: WalletHandle
  node?: AztecNode
  contracts?: NocomPublicContracts
  escrowContracts: Map<string, NocomEscrowV1Contract> // Maps debtPool address -> escrow contract
  registerEscrow: (debtPoolAddress: string, escrowAddress: string, secretKey: string, instanceString: string) => Promise<NocomEscrowV1Contract>
  connect: (provider?: WalletProviderType) => Promise<void>
  disconnect: () => Promise<void>
  setActiveAccount: (address: string) => Promise<void>
  refreshAccounts: () => Promise<WalletAccount[]>
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined)

const DEFAULT_NODE_URL = process.env.NEXT_PUBLIC_AZTEC_NODE_URL ?? 'http://localhost:8080'

const normaliseAlias = (alias?: string) => alias?.replace(/^accounts:/, '') ?? ''

// Helper function to get contract addresses - called at runtime
const getContractAddresses = () => ({
  USDC_CONTRACT: process.env.NEXT_PUBLIC_USDC_CONTRACT!,
  ZCASH_CONTRACT: process.env.NEXT_PUBLIC_ZCASH_CONTRACT!,
  PRICE_ORACLE_CONTRACT: process.env.NEXT_PUBLIC_PRICE_ORACLE_CONTRACT!,
  ZEC_DEBT_POOL_CONTRACT: process.env.NEXT_PUBLIC_ZEC_DEBT_POOL_CONTRACT!,
  USDC_DEBT_POOL_CONTRACT: process.env.NEXT_PUBLIC_USDC_DEBT_POOL_CONTRACT!,
})

const mapEmbeddedAccounts = (accounts: Aliased<AztecAddress>[]): WalletAccount[] =>
  accounts
    .map(({ item, alias }) => ({
      address: item.toString(),
      label: normaliseAlias(alias) || item.toString().slice(0, 10),
    }))

const mapExtensionAccounts = (accounts: unknown): WalletAccount[] => {
  if (!Array.isArray(accounts)) {
    return []
  }
  return accounts
    .map((account) => {
      if (!account) {
        return undefined
      }
      if (typeof account === 'string') {
        return { address: account, label: account.slice(0, 10) }
      }
      if (typeof account === 'object') {
        const maybeAddress = (account as { address?: string }).address
        if (maybeAddress) {
          const label = (account as { alias?: string }).alias ?? maybeAddress.slice(0, 10)
          return { address: maybeAddress, label }
        }
      }
      return undefined
    })
    .filter((value): value is WalletAccount => Boolean(value))
}

export const WalletProvider = ({ children }: PropsWithChildren) => {
  const [status, setStatus] = useState<WalletStatus>('disconnected')
  const [providerType, setProviderType] = useState<WalletProviderType | undefined>(undefined)
  const [accounts, setAccounts] = useState<WalletAccount[]>([])
  const [node, setNode] = useState<AztecNode | undefined>(undefined)
  const [activeAccountState, setActiveAccountState] = useState<WalletAccount | undefined>(undefined)
  const [contracts, setContracts] = useState<NocomPublicContracts | undefined>(undefined)
  const [escrowContracts, setEscrowContracts] = useState<Map<string, NocomEscrowV1Contract>>(new Map())

  const walletHandleRef = useRef<WalletHandle | undefined>(undefined)
  const activeAccountRef = useRef<WalletAccount | undefined>(undefined)

  const setActiveAccountInternal = useCallback((account?: WalletAccount) => {
    activeAccountRef.current = account
    setActiveAccountState(account)
  }, [])

  // Load all escrows from local storage for the current user
  const loadEscrowsFromStorage = useCallback(async (userAddress: string) => {
    const handle = walletHandleRef.current
    if (!handle || handle.type !== 'embedded') {
      console.log('[WalletContext] Skipping escrow load - not embedded wallet')
      return
    }

    const escrowMappings = getEscrowMappings(userAddress)
    const debtPoolAddresses = Object.keys(escrowMappings)

    if (debtPoolAddresses.length === 0) {
      console.log('[WalletContext] No escrows found in storage for user:', userAddress)
      return
    }

    console.log('[WalletContext] Loading', debtPoolAddresses.length, 'escrows from storage for user:', userAddress)

    const loadedEscrows = new Map<string, NocomEscrowV1Contract>()

    for (const debtPoolAddress of debtPoolAddresses) {
      const escrowData = escrowMappings[debtPoolAddress]
      try {
        console.log('[WalletContext] Loading escrow for pool:', debtPoolAddress)

        const escrowAztecAddress = AztecAddress.fromString(escrowData.escrowAddress)
        const secretKeyFr = Fr.fromString(escrowData.secretKey)
        const escrowContractInstance = ContractInstanceWithAddressSchema.parse(
          JSON.parse(escrowData.instance)
        )

        // Use simulation queue to prevent IndexedDB transaction conflicts
        const escrowContract = await simulationQueue.enqueue(async () => {
          await handle.instance.registerContract(escrowContractInstance, NocomEscrowV1ContractArtifact, secretKeyFr)
          await handle.instance.registerSender(escrowAztecAddress)
          return await NocomEscrowV1Contract.at(escrowAztecAddress, handle.instance)
        })

        loadedEscrows.set(debtPoolAddress, escrowContract)
        console.log('[WalletContext] Successfully loaded escrow for pool:', debtPoolAddress)
      } catch (error) {
        console.error('[WalletContext] Failed to load escrow for pool:', debtPoolAddress, error)
        // Continue loading other escrows even if one fails
      }
    }

    if (loadedEscrows.size > 0) {
      setEscrowContracts(loadedEscrows)
      console.log('[WalletContext] Loaded', loadedEscrows.size, 'escrows from storage')
    }
  }, [])

  const registerEscrow = useCallback(async (debtPoolAddress: string, escrowAddress: string, secretKey: string, instanceString: string) => {
    const handle = walletHandleRef.current
    if (!handle || handle.type !== 'embedded') {
      throw new Error('Escrow registration only supported for embedded wallet')
    }

    try {
      console.log('[WalletContext] Registering escrow contract:', { debtPoolAddress, escrowAddress })

      const escrowAztecAddress = AztecAddress.fromString(escrowAddress)
      const secretKeyFr = Fr.fromString(secretKey)

      // Parse the contract instance from the stored JSON string
      const escrowContractInstance = ContractInstanceWithAddressSchema.parse(
        JSON.parse(instanceString)
      )

      // Use simulation queue to prevent IndexedDB transaction conflicts
      const escrowContract = await simulationQueue.enqueue(async () => {
        // Register the contract with its secret key so the PXE can decrypt notes
        await handle.instance.registerContract(escrowContractInstance, NocomEscrowV1ContractArtifact, secretKeyFr)
        console.log('[WalletContext] Escrow contract registered with PXE')

        // Register as sender
        await handle.instance.registerSender(escrowAztecAddress)
        console.log('[WalletContext] Escrow registered as sender')

        // Now initialize the contract interface
        return await NocomEscrowV1Contract.at(
          escrowAztecAddress,
          handle.instance
        )
      })

      setEscrowContracts(prev => {
        const updated = new Map(prev)
        updated.set(debtPoolAddress, escrowContract)
        return updated
      })

      console.log('[WalletContext] Escrow contract registered successfully')
      return escrowContract
    } catch (error) {
      console.error('[WalletContext] Failed to register escrow:', error)
      throw error
    }
  }, [])

  const disconnect = useCallback(async () => {
    const handle = walletHandleRef.current
    if (handle?.type === 'embedded') {
      const destroy = (handle.instance as unknown as { destroy?: () => Promise<void> }).destroy
      if (typeof destroy === 'function') {
        try {
          await destroy()
        } catch (error) {
          console.warn('Error while destroying embedded wallet', error)
        }
      }
    }
    walletHandleRef.current = undefined
    setStatus('disconnected')
    setProviderType(undefined)
    setAccounts([])
    setNode(undefined)
    setActiveAccountInternal(undefined)
    setContracts(undefined)
    setEscrowContracts(new Map())
  }, [setActiveAccountInternal])

  const refreshAccounts = useCallback(async () => {
    const handle = walletHandleRef.current
    let mapped: WalletAccount[] = []

    if (handle?.type === 'embedded') {
      const embeddedAccounts = await handle.instance.getAccounts()
      mapped = mapEmbeddedAccounts(embeddedAccounts)
    } else if (handle?.type === 'extension') {
      if (typeof handle.instance.getAccounts === 'function') {
        const extensionAccounts = await handle.instance.getAccounts()
        mapped = mapExtensionAccounts(extensionAccounts)
      }
    }

    setAccounts(mapped)

    if (mapped.length === 0) {
      setActiveAccountInternal(undefined)
    } else {
      const currentAddress = activeAccountRef.current?.address
      const nextActive = mapped.find((account) => account.address === currentAddress) ?? mapped[0]
      setActiveAccountInternal(nextActive)
    }

    return mapped
  }, [setActiveAccountInternal])

  const connect = useCallback(
    async (provider: WalletProviderType = 'embedded') => {
      if (status === 'connecting') {
        return
      }

      await disconnect()
      setStatus('connecting')
      setProviderType(provider)

      try {
        if (provider === 'embedded') {
          const { EmbeddedWallet } = await import('@/lib/wallet/embeddedWallet')
          const wallet = await EmbeddedWallet.create(DEFAULT_NODE_URL)
          const node = createAztecNodeClient(DEFAULT_NODE_URL)
          setNode(node)
          walletHandleRef.current = { type: 'embedded', instance: wallet }
        } else {
          const { ExtensionWallet } = await import('@/lib/wallet/extensionWallet')
          const wallet = ExtensionWallet.create()
          walletHandleRef.current = { type: 'extension', instance: wallet }
        }

        await refreshAccounts()
        setStatus('connected')
      } catch (error) {
        console.error('Failed to connect wallet', error)
        await disconnect()
        throw error
      }
    },
    [disconnect, refreshAccounts, status],
  )

  const setActiveAccount = useCallback(
    async (address: string) => {
      const current = activeAccountRef.current
      if (current?.address === address) {
        return
      }
      const nextAccount = accounts.find((account) => account.address === address)
      if (nextAccount) {
        setActiveAccountInternal(nextAccount)
        // Clear escrow cache when switching accounts since escrows are per-user
        setEscrowContracts(new Map())
        // Load escrows for the new account
        await loadEscrowsFromStorage(nextAccount.address)
      }
    },
    [accounts, setActiveAccountInternal, loadEscrowsFromStorage],
  )

  // Background initialization of sender connections after wallet connects
  useEffect(() => {
    const initializeSenders = async () => {
      if (status === 'connected' && walletHandleRef.current?.type === 'embedded' && node) {
        try {
          const wallet = walletHandleRef.current.instance
          console.log("Initializing contracts...")
          const initializedContracts = await registerPublicContracts(wallet);
          setContracts(initializedContracts)
          console.log("Registered all contracts in address book")

          // Load escrows from storage for the active account
          const currentAccount = activeAccountRef.current
          if (currentAccount) {
            console.log('[WalletContext] Loading escrows for account:', currentAccount.address)
            await loadEscrowsFromStorage(currentAccount.address)
          }
        } catch (error) {
          console.error('Failed to initialize senders:', error)
        }
      }
    }

    initializeSenders()
  }, [status, loadEscrowsFromStorage])

  const value = useMemo<WalletContextValue>(
    () => ({
      status,
      providerType,
      accounts,
      activeAccount: activeAccountState,
      wallet: walletHandleRef.current,
      node,
      contracts,
      escrowContracts,
      registerEscrow,
      connect,
      disconnect,
      setActiveAccount,
      refreshAccounts,
    }),
    [
      status,
      providerType,
      accounts,
      activeAccountState,
      contracts,
      escrowContracts,
      registerEscrow,
      connect,
      disconnect,
      setActiveAccount,
      refreshAccounts,
    ],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export const useWallet = () => {
  const context = useContext(WalletContext)
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider')
  }
  return context
}

export const useContracts = () => {
  const { contracts } = useWallet()
  if (!contracts) {
    throw new Error('Contracts not initialized - wallet must be connected and contracts loaded')
  }
  return contracts
}

export default WalletContext
