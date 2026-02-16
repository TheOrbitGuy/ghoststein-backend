// GHOSTSTEIN Aviator Game Backend - Solana Edition
// Optimized for Replit deployment with "Always On"

const express = require('express');
const cors = require('cors');
const { 
  Connection, 
  PublicKey, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  TOKEN_PROGRAM_ID
} = require('@solana/spl-token');
const bs58 = require('bs58');

const app = express();
app.use(cors());
app.use(express.json());

// ============================================
// CONFIGURATION
// ============================================

const PORT = process.env.PORT || 3000;

// GHOSTSTEIN Token Configuration
const TOKEN_MINT = "B3KBtvcqG84748NRaSu5YK1vm6tv8aqVpdEkamwapump";
const TOKEN_NAME = "GHOSTSTEIN";
const TOKEN_SYMBOL = "$GHOSTSTEIN";

// Solana Configuration
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const HOT_WALLET_PRIVATE_KEY = process.env.HOT_WALLET_PRIVATE_KEY; // Base58 encoded

// Initialize Solana connection
const connection = new Connection(SOLANA_RPC, 'confirmed');

// Hot wallet for the game
let gameWallet = null;
let gameWalletPublicKey = null;

if (HOT_WALLET_PRIVATE_KEY) {
  try {
    const secretKey = bs58.decode(HOT_WALLET_PRIVATE_KEY);
    gameWallet = Keypair.fromSecretKey(secretKey);
    gameWalletPublicKey = gameWallet.publicKey.toString();
    console.log('✅ Game Wallet loaded:', gameWalletPublicKey);
  } catch (error) {
    console.error('❌ Failed to load hot wallet:', error.message);
  }
}

// Simple in-memory storage (replace with database in production)
const users = new Map();
const games = new Map();
const transactions = new Map();

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getUser(userId) {
  if (!users.has(userId)) {
    users.set(userId, {
      userId,
      balance: 0,
      walletAddress: null,
      gamesPlayed: 0,
      totalWagered: 0,
      totalWon: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
      transactions: [],
      createdAt: Date.now()
    });
  }
  return users.get(userId);
}

function generateCrashPoint(seed) {
  // Simple hash-based random generation
  const hash = seed.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
  
  const random = Math.abs(hash % 10000) / 10000;
  
  // House edge: 3%
  const houseEdge = 0.97;
  
  if (random < 0.3) return parseFloat(((1.00 + Math.random() * 0.5) * houseEdge).toFixed(2));
  if (random < 0.6) return parseFloat(((1.50 + Math.random() * 1.0) * houseEdge).toFixed(2));
  if (random < 0.85) return parseFloat(((2.50 + Math.random() * 2.5) * houseEdge).toFixed(2));
  return parseFloat(((5.00 + Math.random() * 5.0) * houseEdge).toFixed(2));
}

async function getTokenBalance(walletAddress) {
  try {
    const publicKey = new PublicKey(walletAddress);
    const mintPublicKey = new PublicKey(TOKEN_MINT);
    
    // Get associated token account
    const tokenAccount = await getAssociatedTokenAddress(
      mintPublicKey,
      publicKey
    );
    
    // Get account info
    const accountInfo = await getAccount(connection, tokenAccount);
    
    // Return balance (convert from raw amount)
    return Number(accountInfo.amount) / Math.pow(10, 9); // Assuming 9 decimals
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
}

// ============================================
// API ENDPOINTS
// ============================================

// Health check
app.get('/', (req, res) => {
  res.json({
    name: 'GHOSTSTEIN Aviator Game',
    status: 'operational',
    blockchain: 'Solana',
    token: TOKEN_SYMBOL,
    mint: TOKEN_MINT
  });
});

// Get configuration
app.get('/api/config', (req, res) => {
  res.json({
    success: true,
    tokenName: TOKEN_NAME,
    tokenSymbol: TOKEN_SYMBOL,
    tokenMint: TOKEN_MINT,
    gameWallet: gameWalletPublicKey,
    network: 'mainnet-beta'
  });
});

// Get user data
app.get('/api/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const user = getUser(userId);
    
    res.json({
      success: true,
      balance: user.balance,
      walletAddress: user.walletAddress,
      gamesPlayed: user.gamesPlayed,
      totalEarned: user.totalWon - user.totalWagered,
      transactions: user.transactions.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save wallet address
app.post('/api/user/wallet', (req, res) => {
  try {
    const { userId, walletAddress } = req.body;
    
    if (!userId || !walletAddress) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }
    
    const user = getUser(userId);
    user.walletAddress = walletAddress;
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify deposit
app.post('/api/deposit/verify', async (req, res) => {
  try {
    const { userId, signature, amount, walletAddress } = req.body;
    
    if (!signature || !amount || !userId) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }
    
    // Check if already processed
    if (transactions.has(signature)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Transaction already processed' 
      });
    }
    
    // In production, verify the transaction on Solana blockchain
    // For now, we'll accept it (add proper verification later)
    
    /*
    // Proper verification would look like this:
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed'
    });
    
    if (!tx || !tx.meta || tx.meta.err) {
      return res.status(400).json({ 
        success: false, 
        error: 'Transaction not found or failed' 
      });
    }
    
    // Verify it's a transfer to game wallet
    // Parse transaction and verify amount
    */
    
    const user = getUser(userId);
    user.balance += amount;
    user.totalDeposited += amount;
    
    const txRecord = {
      type: 'deposit',
      userId,
      amount,
      signature,
      timestamp: Date.now(),
      status: 'confirmed'
    };
    
    transactions.set(signature, txRecord);
    user.transactions.unshift(txRecord);
    
    console.log(`✅ Deposit: ${amount} ${TOKEN_SYMBOL} for user ${userId}`);
    
    res.json({
      success: true,
      balance: user.balance,
      amount
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Process withdrawal
app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, amount, walletAddress } = req.body;
    
    if (!userId || !amount || !walletAddress || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }
    
    if (!gameWallet) {
      return res.status(503).json({ 
        success: false, 
        error: 'Game wallet not configured' 
      });
    }
    
    const user = getUser(userId);
    
    if (user.balance < amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Insufficient balance' 
      });
    }
    
    if (user.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({ 
        success: false, 
        error: 'Wallet address mismatch' 
      });
    }
    
    // Create and send Solana token transfer
    try {
      const userPublicKey = new PublicKey(walletAddress);
      const mintPublicKey = new PublicKey(TOKEN_MINT);
      
      // Get token accounts
      const gameTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        gameWallet.publicKey
      );
      
      const userTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        userPublicKey
      );
      
      // Convert amount to raw token amount (assuming 9 decimals)
      const rawAmount = BigInt(Math.floor(amount * Math.pow(10, 9)));
      
      // Create transfer instruction
      const transferInstruction = createTransferInstruction(
        gameTokenAccount,
        userTokenAccount,
        gameWallet.publicKey,
        rawAmount,
        [],
        TOKEN_PROGRAM_ID
      );
      
      // Create transaction
      const transaction = new Transaction().add(transferInstruction);
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = gameWallet.publicKey;
      
      // Sign and send
      transaction.sign(gameWallet);
      const signature = await connection.sendRawTransaction(
        transaction.serialize()
      );
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      // Deduct from balance
      user.balance -= amount;
      user.totalWithdrawn += amount;
      
      const txRecord = {
        type: 'withdraw',
        userId,
        amount,
        signature,
        timestamp: Date.now(),
        status: 'confirmed'
      };
      
      transactions.set(signature, txRecord);
      user.transactions.unshift(txRecord);
      
      console.log(`✅ Withdrawal: ${amount} ${TOKEN_SYMBOL} to ${walletAddress}`);
      
      res.json({
        success: true,
        balance: user.balance,
        signature
      });
      
    } catch (solanaError) {
      console.error('Solana transaction error:', solanaError);
      res.status(500).json({ 
        success: false, 
        error: 'Blockchain transaction failed: ' + solanaError.message 
      });
    }
    
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Start game
app.post('/api/game/start', (req, res) => {
  try {
    const { userId, betAmount } = req.body;
    
    if (!userId || !betAmount || betAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid bet' });
    }
    
    const user = getUser(userId);
    
    if (user.balance < betAmount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Insufficient balance' 
      });
    }
    
    user.balance -= betAmount;
    user.totalWagered += betAmount;
    user.gamesPlayed += 1;
    
    const gameId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const seed = `${gameId}-${Date.now()}`;
    const crashPoint = generateCrashPoint(seed);
    
    const game = {
      gameId,
      userId,
      betAmount,
      crashPoint,
      seed,
      startTime: Date.now(),
      status: 'active'
    };
    
    games.set(gameId, game);
    user.currentGameId = gameId;
    
    res.json({
      success: true,
      gameId,
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cash out
app.post('/api/game/cashout', (req, res) => {
  try {
    const { userId, multiplier } = req.body;
    
    if (!userId || !multiplier) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }
    
    const user = getUser(userId);
    const gameId = user.currentGameId;
    
    if (!gameId) {
      return res.status(400).json({ success: false, error: 'No active game' });
    }
    
    const game = games.get(gameId);
    
    if (!game || game.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Game not found or ended' });
    }
    
    if (multiplier > game.crashPoint) {
      game.status = 'crashed';
      user.currentGameId = null;
      
      return res.json({
        success: false,
        crashed: true,
        crashPoint: game.crashPoint
      });
    }
    
    game.status = 'cashedOut';
    game.cashoutMultiplier = multiplier;
    user.currentGameId = null;
    
    const winAmount = game.betAmount * multiplier;
    user.balance += winAmount;
    user.totalWon += winAmount;
    
    console.log(`💰 Cashout: User ${userId} won ${winAmount.toFixed(2)} at ${multiplier}x`);
    
    res.json({
      success: true,
      winAmount,
      balance: user.balance
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get leaderboard
app.get('/api/leaderboard', (req, res) => {
  try {
    const leaderboard = Array.from(users.values())
      .map(user => ({
        userId: user.userId.slice(0, 8) + '...',
        profit: user.totalWon - user.totalWagered,
        gamesPlayed: user.gamesPlayed
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 20);
    
    res.json({ success: true, leaderboard });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get stats
app.get('/api/stats', (req, res) => {
  try {
    const totalUsers = users.size;
    const totalGames = Array.from(users.values()).reduce((sum, u) => sum + u.gamesPlayed, 0);
    const totalWagered = Array.from(users.values()).reduce((sum, u) => sum + u.totalWagered, 0);
    const totalWon = Array.from(users.values()).reduce((sum, u) => sum + u.totalWon, 0);
    const houseProfit = totalWagered - totalWon;
    
    res.json({
      success: true,
      stats: {
        totalUsers,
        totalGames,
        totalWagered: totalWagered.toFixed(2),
        totalWon: totalWon.toFixed(2),
        houseProfit: houseProfit.toFixed(2),
        houseEdge: totalWagered > 0 
          ? ((houseProfit / totalWagered) * 100).toFixed(2)
          : 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check with detailed info
app.get('/api/health', async (req, res) => {
  try {
    let solanaStatus = 'disconnected';
    let currentSlot = null;
    let gameWalletBalance = null;
    
    if (connection) {
      try {
        currentSlot = await connection.getSlot();
        solanaStatus = 'connected';
        
        if (gameWallet) {
          const balance = await connection.getBalance(gameWallet.publicKey);
          gameWalletBalance = (balance / LAMPORTS_PER_SOL).toFixed(4) + ' SOL';
        }
      } catch (err) {
        solanaStatus = 'error';
      }
    }
    
    res.json({
      success: true,
      status: 'operational',
      blockchain: {
        network: 'Solana Mainnet',
        status: solanaStatus,
        currentSlot,
        gameWallet: gameWalletPublicKey,
        gameWalletBalance
      },
      server: {
        uptime: process.uptime(),
        users: users.size,
        games: games.size,
        transactions: transactions.size
      },
      token: {
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        mint: TOKEN_MINT
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║           👻 GHOSTSTEIN AVIATOR GAME                ║
║              Solana Edition - Replit                ║
╚══════════════════════════════════════════════════════╝
  
  🚀 Server:     http://localhost:${PORT}
  ⛓️  Blockchain: Solana Mainnet
  ${gameWalletPublicKey ? '✅ Game Wallet: ' + gameWalletPublicKey : '❌ Game Wallet: Not configured'}
  👻 Token:      ${TOKEN_SYMBOL}
  📍 Mint:       ${TOKEN_MINT}
  
  📡 API Endpoints:
  - GET  /api/config
  - GET  /api/user/:userId
  - POST /api/user/wallet
  - POST /api/deposit/verify
  - POST /api/withdraw
  - POST /api/game/start
  - POST /api/game/cashout
  - GET  /api/leaderboard
  - GET  /api/stats
  - GET  /api/health
  
  🔐 To enable withdrawals, set HOT_WALLET_PRIVATE_KEY in Secrets
  `);
});

// Keep alive for Replit (prevents sleeping)
setInterval(() => {
  console.log('⏰ Keep alive ping -', new Date().toISOString());
}, 5 * 60 * 1000); // Every 5 minutes
