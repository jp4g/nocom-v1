'use client'

import { Wallet, Link } from 'lucide-react'

type ProviderLogosProps = {
  id: 'aztec-native' | 'browser-bridge'
}

export default function ProviderLogos({ id }: ProviderLogosProps) {
  if (id === 'aztec-native') {
    return <Wallet className="w-6 h-6 text-brand-purple" />
  }
  
  if (id === 'browser-bridge') {
    return <Link className="w-6 h-6 text-text-muted" />
  }

  return null
}
