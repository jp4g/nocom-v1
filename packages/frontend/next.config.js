/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_AZTEC_NODE_URL: process.env.NEXT_PUBLIC_AZTEC_NODE_URL,
    NEXT_PUBLIC_USDC_CONTRACT: process.env.NEXT_PUBLIC_USDC_CONTRACT,
    NEXT_PUBLIC_ZCASH_CONTRACT: process.env.NEXT_PUBLIC_ZCASH_CONTRACT,
    NEXT_PUBLIC_PRICE_ORACLE_CONTRACT: process.env.NEXT_PUBLIC_PRICE_ORACLE_CONTRACT,
    NEXT_PUBLIC_ZEC_DEBT_POOL_CONTRACT: process.env.NEXT_PUBLIC_ZEC_DEBT_POOL_CONTRACT,
    NEXT_PUBLIC_USDC_DEBT_POOL_CONTRACT: process.env.NEXT_PUBLIC_USDC_DEBT_POOL_CONTRACT,
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    }
    return config
  },
}

module.exports = nextConfig
