'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWallet } from '@/hooks/useWallet'
import ProviderLogos from '@/components/icons/ProviderLogos'
import EmbeddedAccountForm from './EmbeddedAccountForm'

const PROVIDER_DESCRIPTIONS = {
  embedded: {
    name: 'Aztec Native Wallet',
    description: 'Full PXE-powered wallet running inside the application sandbox.',
  },
  extension: {
    name: 'Extension Wallet',
    description: 'Connect to a browser extension wallet (coming soon).',
  },
} as const

type WalletModalProps = {
  open: boolean
  onClose: () => void
}

export default function WalletModal({ open, onClose }: WalletModalProps) {
  const {
    status,
    providerType,
    accounts,
    activeAccount,
    wallet,
    connect,
    disconnect,
    setActiveAccount,
    refreshAccounts,
  } = useWallet()

  const [pendingProvider, setPendingProvider] = useState<'embedded' | 'extension' | null>(null)
  const [showCreateAccount, setShowCreateAccount] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      setPendingProvider(null)
      setShowCreateAccount(false)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const modalMeta = useMemo(() => {
    if (status === 'connecting') {
      return {
        title: 'Connecting wallet&',
        description: 'Authorising PXE and syncing account data. This may take a moment.',
      }
    }

    if (status === 'connected') {
      const providerName = providerType ? PROVIDER_DESCRIPTIONS[providerType].name : 'Wallet'
      return {
        title: `${providerName} connected`,
        description: 'Manage accounts, switch active session, or disconnect below.',
      }
    }

    return {
      title: 'Connect a wallet',
      description: 'Choose a provider to begin a private Aztec session.',
    }
  }, [status, providerType])

  const handleConnect = async (provider: 'embedded' | 'extension') => {
    if (status === 'connecting') {
      return
    }
    setPendingProvider(provider)
    try {
      await connect(provider)
      toast.success(`${PROVIDER_DESCRIPTIONS[provider].name} connected`)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Unable to connect ${PROVIDER_DESCRIPTIONS[provider].name}`
      toast.error(message)
    } finally {
      setPendingProvider(null)
    }
  }

  const handleDisconnect = async () => {
    await disconnect()
    toast.success('Wallet disconnected')
    onClose()
  }

  const handleAccountCreated = async (address: string) => {
    const refreshed = await refreshAccounts()
    const created = refreshed.find((account) => account.address === address)
    if (created) {
      setActiveAccount(created.address)
    }
    setShowCreateAccount(false)
  }

  const isEmbedded = providerType === 'embedded' && wallet?.type === 'embedded'
  const isConnecting = status === 'connecting'
  const isConnected = status === 'connected'

  if (!open || !mounted) return null

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-hidden"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isConnecting) {
          onClose()
        }
      }}
    >
      <div className="relative w-full max-w-md bg-surface border border-surface-border rounded-lg shadow-xl mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-surface-border">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">{modalMeta.title}</h2>
              <p className="mt-1 text-sm text-text-muted">{modalMeta.description}</p>
            </div>
            {!isConnecting && (
              <button
                onClick={onClose}
                className="text-text-muted hover:text-white transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="p-6">
          {status === 'disconnected' && (
            <div className="space-y-3">
              <button
                onClick={() => handleConnect('embedded')}
                disabled={isConnecting || pendingProvider === 'embedded'}
                className="w-full p-4 bg-surface-hover border border-surface-border rounded-lg hover:border-brand-purple transition-all text-left disabled:opacity-50"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <ProviderLogos id="aztec-native" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-white">
                      {PROVIDER_DESCRIPTIONS.embedded.name}
                    </h3>
                    <p className="text-sm text-text-muted">
                      {PROVIDER_DESCRIPTIONS.embedded.description}
                    </p>
                  </div>
                  {pendingProvider === 'embedded' && (
                    <Loader2 className="w-5 h-5 animate-spin text-brand-purple" />
                  )}
                </div>
              </button>

              <button
                onClick={() => toast.error('Extension wallet not available yet')}
                disabled
                className="w-full p-4 bg-surface-hover/50 border border-surface-border rounded-lg text-left opacity-50 cursor-not-allowed"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0">
                    <ProviderLogos id="browser-bridge" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white">
                        {PROVIDER_DESCRIPTIONS.extension.name}
                      </h3>
                      <span className="px-2 py-0.5 text-xs bg-surface border border-surface-border rounded text-text-muted">
                        Soon
                      </span>
                    </div>
                    <p className="text-sm text-text-muted">
                      {PROVIDER_DESCRIPTIONS.extension.description}
                    </p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {isConnecting && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-brand-purple mb-4" />
              <p className="text-white">Authorising wallet&</p>
            </div>
          )}

          {isConnected && (
            <div className="space-y-6">
              <div className="inline-block px-3 py-1 bg-brand-purple/10 border border-brand-purple/30 rounded-full text-sm text-white">
                {PROVIDER_DESCRIPTIONS[providerType ?? 'embedded'].name}
              </div>

              <div>
                <h3 className="text-sm font-medium text-white mb-3">Accounts</h3>
                {accounts.length === 0 ? (
                  <p className="text-sm text-text-muted">No accounts yet</p>
                ) : (
                  <div className="space-y-2">
                    {accounts.map((account) => {
                      const isActive = account.address === activeAccount?.address
                      return (
                        <button
                          key={account.address}
                          onClick={() => setActiveAccount(account.address)}
                          className={`w-full p-3 rounded-lg border transition-all text-left ${
                            isActive
                              ? 'bg-brand-purple/10 border-brand-purple'
                              : 'bg-surface-hover border-surface-border hover:border-brand-purple/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-white">{account.label}</p>
                              <p className="text-sm text-text-muted font-mono">
                                {account.address.slice(0, 6)}&{account.address.slice(-4)}
                              </p>
                            </div>
                            {isActive && (
                              <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {activeAccount && (
                <div>
                  <h3 className="text-sm font-medium text-white mb-2">Active address</h3>
                  <div className="p-3 bg-surface-hover border border-surface-border rounded-lg">
                    <p className="text-sm text-text-muted font-mono break-all">
                      {activeAccount.address}
                    </p>
                  </div>
                </div>
              )}

              {isEmbedded && wallet?.type === 'embedded' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-white">Embedded wallet</h3>
                    <button
                      onClick={() => setShowCreateAccount((prev) => !prev)}
                      className="text-sm text-brand-purple hover:text-brand-purple-hover transition-colors"
                    >
                      {showCreateAccount ? 'Cancel' : 'Create new account'}
                    </button>
                  </div>
                  {showCreateAccount && (
                    <EmbeddedAccountForm
                      wallet={wallet.instance}
                      onCreated={handleAccountCreated}
                    />
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-surface-border">
                <button
                  onClick={() => refreshAccounts()}
                  className="flex-1 px-4 py-2 bg-surface-hover border border-surface-border rounded-lg text-white hover:bg-surface transition-all"
                >
                  Refresh accounts
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 text-text-muted hover:text-white transition-colors"
                >
                  Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}
