import express from 'express';
import { AirtimeDatabase } from '../database/Database';

const router = express.Router();
const db = new AirtimeDatabase(process.env.DATABASE_PATH || './airtime.db');

/**
 * ENS Registration Endpoint
 * Called by Rust backend when user registers with JOIN <name>
 */
router.post('/register', async (req, res) => {
  try {
    const { phoneNumber, ensName, walletAddress } = req.body;
    
    if (!phoneNumber || !ensName || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phoneNumber, ensName, walletAddress',
      });
    }
    
    // Validate ENS name format
    const cleanName = ensName.toLowerCase().trim();
    if (cleanName.length < 3 || cleanName.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'ENS name must be 3-20 characters',
      });
    }
    
    if (!/^[a-z0-9]+$/.test(cleanName)) {
      return res.status(400).json({
        success: false,
        error: 'ENS name can only contain letters and numbers',
      });
    }
    
    const fullEnsName = `${cleanName}.ttcip.eth`;
    
    // Check if user exists in airtime database
    let user = db.getUser(phoneNumber);
    
    if (user) {
      // Update existing user's ENS name
      db.updateUserEnsName(phoneNumber, fullEnsName);
      console.log(`📝 ENS updated: ${fullEnsName} for ${phoneNumber}`);
    } else {
      // User doesn't exist in airtime DB yet - they'll be created when they buy airtime
      // For now, just log it
      console.log(`📝 ENS registration noted: ${fullEnsName} for ${phoneNumber} (wallet: ${walletAddress})`);
    }
    
    // TODO: Call actual ENS contract to register subdomain on-chain
    // This would use the ens_service Rust code to mint the subdomain
    
    res.json({
      success: true,
      ensName: fullEnsName,
      walletAddress,
      message: `ENS name ${fullEnsName} registered for ${walletAddress}`,
    });
    
  } catch (error: any) {
    console.error('ENS registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to register ENS name',
    });
  }
});

/**
 * Check if ENS name is available
 */
router.get('/check/:ensName', async (req, res) => {
  try {
    const { ensName } = req.params;
    const cleanName = ensName.toLowerCase().trim();
    
    // Validate format
    if (cleanName.length < 3 || cleanName.length > 20) {
      return res.json({
        success: true,
        available: false,
        reason: 'Name must be 3-20 characters',
      });
    }
    
    if (!/^[a-z0-9]+$/.test(cleanName)) {
      return res.json({
        success: true,
        available: false,
        reason: 'Name can only contain letters and numbers',
      });
    }
    
    const fullEnsName = `${cleanName}.ttcip.eth`;
    
    // Check if name exists in database
    const isTaken = db.isEnsNameTaken(fullEnsName);
    
    res.json({
      success: true,
      available: !isTaken,
      ensName: fullEnsName,
      reason: isTaken ? 'Name already taken' : undefined,
    });
    
  } catch (error: any) {
    console.error('ENS check error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Resolve ENS name to address
 */
router.get('/resolve/:ensName', async (req, res) => {
  try {
    const { ensName } = req.params;
    
    // TODO: Query ENS contract or database
    // For now, return not implemented
    
    res.json({
      success: false,
      error: 'ENS resolution not yet implemented',
    });
    
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
