import crypto from 'crypto';
import { config } from '../config/env.js';

/**
 * SHA-256 hash of claim data — deterministic, verifiable, no wallet required.
 * Returns a "sha256:<hex>" string that can be stored and verified later.
 */
const sha256Hash = (data) => {
  return 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

/**
 * Log a claim payout to blockchain.
 *
 * Mode: sha256_fallback
 *   - Computes SHA-256 of claim payload
 *   - Returns deterministic hash (verifiable offline)
 *   - No gas / wallet / RPC required
 *
 * Mode: sepolia (future — keys required)
 *   - Sends 0-value tx to Sepolia with claim hash in calldata
 *   - Returns real tx hash
 *
 * @param {{
 *   claimId: string,
 *   userId: string,
 *   policyId: string,
 *   payoutAmount: number,
 *   triggerType: string,
 *   timestamp: string
 * }} claimData
 * @returns {{ hash: string, mode: string, timestamp: string }}
 */
export const logClaimToBlockchain = async (claimData) => {
  const payload = {
    claimId: claimData.claimId,
    userId: claimData.userId,
    policyId: claimData.policyId,
    payoutAmount: claimData.payoutAmount,
    triggerType: claimData.triggerType,
    timestamp: claimData.timestamp || new Date().toISOString(),
    platform: 'ShieldPay',
    version: '2.0',
  };

  // ── SHA-256 Fallback Mode ────────────────────────────────────────────────────
  if (config.blockchainMode === 'sha256_fallback' || !config.sepoliaRpcUrl || !config.walletPrivateKey) {
    const hash = sha256Hash(payload);
    console.log(`🔐 [Blockchain] SHA-256 log: ${hash.slice(0, 40)}...`);
    return { hash, mode: 'sha256_fallback', timestamp: payload.timestamp };
  }

  // ── Sepolia Live Mode ────────────────────────────────────────────────────────
  try {
    const { ethers } = await import('ethers');
    const provider = new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
    const wallet = new ethers.Wallet(config.walletPrivateKey, provider);

    const claimHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    const tx = await wallet.sendTransaction({
      to: wallet.address, // self-send (0-value logging tx)
      value: 0n,
      data: ethers.hexlify(ethers.toUtf8Bytes(`shieldpay:${claimHash}`)),
    });

    await tx.wait(1); // wait for 1 confirmation
    console.log(`⛓️  [Blockchain] Sepolia tx: ${tx.hash}`);
    return { hash: tx.hash, mode: 'sepolia', timestamp: payload.timestamp };
  } catch (err) {
    console.error(`⚠️  Sepolia tx failed (${err.message}), falling back to sha256`);
    const hash = sha256Hash(payload);
    return { hash, mode: 'sha256_fallback_on_error', timestamp: payload.timestamp };
  }
};

/**
 * Verify a SHA-256 hash matches claim data (for audit purposes)
 */
export const verifyClaimHash = (claimData, storedHash) => {
  if (!storedHash.startsWith('sha256:')) return null;
  const expected = sha256Hash(claimData);
  return expected === storedHash;
};
