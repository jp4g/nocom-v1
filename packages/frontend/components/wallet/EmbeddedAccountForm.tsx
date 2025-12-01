'use client'

import { useState } from 'react'
import { Fr } from '@aztec/aztec.js/fields'
import { deriveSigningKey } from '@aztec/stdlib/keys'
import { randomBytes } from '@aztec/foundation/crypto'
import type { EmbeddedWallet } from '@/lib/wallet/embeddedWallet'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AccountTypes, type AccountType } from '@/lib/wallet/walletDB'

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  schnorr: 'Schnorr (recommended)',
  ecdsasecp256r1: 'ECDSA R1',
  ecdsasecp256k1: 'ECDSA K1',
}

const generateSigningKey = (type: AccountType, secret: Fr) => {
  if (type === 'schnorr') {
    return deriveSigningKey(secret).toBuffer()
  }
  return randomBytes(32)
}

type EmbeddedAccountFormProps = {
  wallet: EmbeddedWallet
  onCreated: (address: string) => Promise<void> | void
}

export default function EmbeddedAccountForm({ wallet, onCreated }: EmbeddedAccountFormProps) {
  const [alias, setAlias] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('schnorr')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault()
    if (!alias.trim()) {
      setError('Alias is required')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const secretKey = Fr.random()
      const salt = Fr.random()
      const signingKey = generateSigningKey(accountType, secretKey)
      const accountManager = await wallet.createAndStoreAccount(
        alias.trim(),
        accountType,
        secretKey,
        salt,
        signingKey,
      )
      const account = await accountManager.getAccount()
      const address = account.getAddress().toString()
      toast.success(`Account ${alias.trim()} created`)
      await onCreated(address)
      setAlias('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create account'
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-surface-hover border border-surface-border rounded-lg">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-white">
          Alias
        </label>
        <input
          type="text"
          value={alias}
          onChange={(event) => setAlias(event.target.value)}
          placeholder="Treasury"
          disabled={isSubmitting}
          maxLength={32}
          className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-white placeholder:text-text-muted focus:outline-none focus:border-brand-purple transition-colors disabled:opacity-50"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-white">
          Account type
        </label>
        <select
          value={accountType}
          onChange={(event) => setAccountType(event.target.value as AccountType)}
          disabled={isSubmitting}
          className="w-full px-3 py-2 bg-surface border border-surface-border rounded-lg text-white focus:outline-none focus:border-brand-purple transition-colors disabled:opacity-50"
        >
          {AccountTypes.map((type) => (
            <option key={type} value={type}>
              {ACCOUNT_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-purple-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Creating&</span>
          </>
        ) : (
          'Create account'
        )}
      </button>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}
    </form>
  )
}
