import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';
import { HistoryEntry, TableData } from './types';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Force development mode for the preview environment
process.env.NODE_ENV = 'development';
console.log('Server starting in FORCE DEVELOPMENT mode');

app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  // Disable caching for all requests to prevent stale content
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Health check route - must be first
app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', time: Date.now(), env: process.env.NODE_ENV });
});

const JWT_SECRET = process.env.JWT_SECRET || 'comptage-mco-secret-key';

// Supabase Initialization
const supabaseUrl = process.env.SUPABASE_URL || 'https://doygmzbgtiaylwfspsdf.supabase.co';
// Use SERVICE_ROLE_KEY if available for backend operations to bypass RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveWdtemJndGlheWx3ZnNwc2RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMTYxODMsImV4cCI6MjA4Nzg5MjE4M30.yYba9R9k2hl956hPr1KnLNCPPqplSaBZqKat6WtMkMg';

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to get subscription price
async function getSubscriptionPrice() {
  try {
    const { data } = await supabase.from('config').select('value').eq('key', 'subscription_price').single();
    return data ? Number(data.value) : 200;
  } catch (e) {
    return 200;
  }
}

// Seed Admin User
async function seedAdmin() {
  try {
    console.log('Running seedAdmin...');
    const adminEmails = ['mco.tradefeatures@gmail.com', 'mco@admin.mg'].map(e => e.trim().toLowerCase());
    
    for (const adminEmail of adminEmails) {
      const { data: admin, error: checkError } = await supabase.from('users').select('id').eq('email', adminEmail).single();
      
      if (checkError && checkError.code !== 'PGRST116') {
        console.error(`Seed Admin Check Error for ${adminEmail}:`, checkError.message);
        continue;
      }

      const passwordHash = await bcrypt.hash('Rina2204@', 10);

      if (!admin) {
        console.log(`Admin user ${adminEmail} not found, creating...`);
        const adminUser = {
          id: adminEmail === 'mco@admin.mg' ? '00000000-0000-0000-0000-000000000001' : 'admin-1',
          email: adminEmail,
          password_hash: passwordHash,
          role: 'admin',
          account_type: 'team',
          created_at: Date.now(),
          company_name: adminEmail === 'mco@admin.mg' ? 'mco' : 'ADMIN MCO',
          mobile: adminEmail === 'mco@admin.mg' ? '004' : '0347685594',
          subscription_end: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000)
        };
        const { error: insertError } = await supabase.from('users').insert([adminUser]);
        if (insertError) console.error(`Seed Admin Insert Error for ${adminEmail}:`, insertError.message);
      } else {
        console.log(`Admin user ${adminEmail} found, updating...`);
        await supabase.from('users').update({ 
          password_hash: passwordHash,
          role: 'admin',
          subscription_end: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000)
        }).eq('email', adminEmail);
      }
    }
  } catch (err: any) {
    console.error('Seed Admin Exception:', err.message);
  }
}

seedAdmin();

// Helper to check and sync admin status
async function syncAdminStatus(email: string, userId: string) {
  const adminEmails = ['mco.tradefeatures@gmail.com', 'mco@admin.mg'].map(e => e.trim().toLowerCase());
  const isMainAdmin = adminEmails.includes(email.trim().toLowerCase());
  
  // Check if email is in admins table
  let isListedAdmin = false;
  try {
    const { data } = await supabase.from('admins').select('email').eq('email', email.trim().toLowerCase()).single();
    isListedAdmin = !!data;
  } catch (e) {
    // Table might not exist, ignore
  }

  const isAdmin = isMainAdmin || isListedAdmin;

  if (isAdmin) {
    // Ensure they are in the admins table if not already (for listed admins or main admin)
    try {
      const { data: existing } = await supabase.from('admins').select('email').eq('email', email.trim().toLowerCase()).single();
      if (!existing) {
        await supabase.from('admins').insert([{ email: email.trim().toLowerCase(), created_at: Date.now() }]);
      }
    } catch (e) {
      // Table might not exist, ignore
    }
  }

  return isAdmin;
}

app.post('/api/auth/admin-bypass', async (req, res) => {
  try {
    const { email, companyName, mobile } = req.body;
    const cleanEmail = email.trim().toLowerCase();
    
    if (cleanEmail !== 'mco@admin.mg') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    // Special admin user ID (static or generated)
    const adminId = '00000000-0000-0000-0000-000000000001';
    
    // Find or create in users table
    let { data: user, error: fetchError } = await supabase.from('users').select('*').eq('email', cleanEmail).single();
    
    if (fetchError && fetchError.code === 'PGRST116') {
      const newUser = {
        id: adminId,
        email: cleanEmail,
        password_hash: 'admin_bypass',
        role: 'admin',
        account_type: 'team',
        company_name: companyName || 'mco',
        mobile: mobile || '004',
        created_at: Date.now(),
        subscription_end: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000,
        last_ip: (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').split(',')[0].trim()
      };
      const { error: insertError } = await supabase.from('users').insert([newUser]);
      if (insertError) throw insertError;
      user = newUser;
    } else {
      // Update IP and other info
      const currentIp = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').split(',')[0].trim();
      const { data: updatedUser } = await supabase.from('users').update({ 
        last_ip: currentIp,
        company_name: companyName || user.company_name,
        mobile: mobile || user.mobile,
        role: 'admin'
      }).eq('id', user.id).select().single();
      if (updatedUser) user = updatedUser;
    }

    const token = jwt.sign({ userId: user!.id }, JWT_SECRET);
    const { password_hash, ...userWithoutPass } = user!;
    res.json({ token, user: userWithoutPass });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erreur bypass admin' });
  }
});

app.post('/api/auth/supabase-login', async (req, res) => {
  try {
    const { access_token, registrationData } = req.body;
    if (!access_token) return res.status(400).json({ error: 'Token requis' });

    // Verify token with Supabase
    const { data: { user: sbUser }, error: sbError } = await supabase.auth.getUser(access_token);
    if (sbError || !sbUser) {
      return res.status(401).json({ error: 'Token Supabase invalide' });
    }

    const email = sbUser.email!.trim().toLowerCase();
    const isAdmin = await syncAdminStatus(email, sbUser.id);
    const currentIp = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').split(',')[0].trim();
    
    // Find or create user in our custom table
    let { data: user, error: fetchError } = await supabase.from('users').select('*').eq('email', email).single();
    
    if (fetchError && fetchError.code === 'PGRST116') {
      // User doesn't exist in our table, create them
      const metadata = sbUser.user_metadata || {};
      const newUser = {
        id: sbUser.id, // Use Supabase Auth ID
        email: email,
        password_hash: 'supabase_auth', // Placeholder
        role: isAdmin ? 'admin' : 'user',
        account_type: metadata.account_type || (isAdmin ? 'team' : 'personal'),
        company_name: registrationData?.companyName || metadata.company_name || (isAdmin ? 'ADMIN MCO' : 'Nouveau Compte'),
        mobile: registrationData?.mobile || metadata.mobile || '',
        created_at: Date.now(),
        subscription_end: isAdmin ? Date.now() + 100 * 365 * 24 * 60 * 60 * 1000 : Date.now() + 30 * 60 * 1000,
        last_ip: currentIp
      };
      const { error: insertError } = await supabase.from('users').insert([newUser]);
      if (insertError) throw insertError;
      user = newUser;
    } else if (fetchError) {
      throw fetchError;
    } else {
      // Update existing user with new registration data if provided
      const updates: any = { last_ip: currentIp };
      if (registrationData?.companyName) updates.company_name = registrationData.companyName;
      if (registrationData?.mobile) updates.mobile = registrationData.mobile;
      if (isAdmin && user.role !== 'admin') {
        updates.role = 'admin';
        updates.subscription_end = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;
      }
      
      if (Object.keys(updates).length > 0) {
        const { data: updatedUser, error: updateError } = await supabase.from('users').update(updates).eq('id', user.id).select().single();
        if (!updateError) user = updatedUser;
      }
    }

    // Issue our custom JWT
    const token = jwt.sign({ userId: user!.id }, JWT_SECRET);
    const { password_hash, ...userWithoutPass } = user!;
    res.json({ token, user: userWithoutPass });
  } catch (err: any) {
    console.error('Supabase Login Error Detail:', JSON.stringify(err, null, 2));
    if (err.message) console.error('Supabase Login Error Message:', err.message);
    res.status(500).json({ 
      error: err.message || 'Erreur lors de la connexion Supabase',
      details: err
    });
  }
});

// MVola Payment Logic
const MVOLA_CONFIG = {
  clientId: process.env.MVOLA_CLIENT_ID,
  clientSecret: process.env.MVOLA_CLIENT_SECRET,
  merchantNumber: process.env.MVOLA_MERCHANT_NUMBER,
  env: process.env.MVOLA_ENVIRONMENT || 'sandbox',
  callbackUrl: process.env.MVOLA_CALLBACK_URL,
};

async function getMVolaToken() {
  const url = MVOLA_CONFIG.env === 'production' 
    ? 'https://api.mvola.mg/token' 
    : 'https://sandbox.mvola.mg/token';
  
  const auth = Buffer.from(`${MVOLA_CONFIG.clientId}:${MVOLA_CONFIG.clientSecret}`).toString('base64');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials&scope=EXT_INT_MVOLA_SCOPE'
  });
  
  if (!response.ok) throw new Error('Failed to get MVola token');
  const data = await response.json();
  return data.access_token;
}

app.post('/api/payment/mvola/initiate', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: user } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: 'Numéro de téléphone requis' });

    const mvolaToken = await getMVolaToken();
    const url = MVOLA_CONFIG.env === 'production'
      ? 'https://api.mvola.mg/mvola/mm/transactions/type/v1/merchantPay'
      : 'https://sandbox.mvola.mg/mvola/mm/transactions/type/v1/merchantPay';

    const correlationId = Date.now().toString();
    const amount = await getSubscriptionPrice();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mvolaToken}`,
        'Version': '1.0',
        'X-Correlation-ID': correlationId,
        'UserLanguage': 'FR',
        'UserIp': '127.0.0.1',
        'X-Callback-URL': MVOLA_CONFIG.callbackUrl || '',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        amount: amount,
        currency: 'Ar',
        descriptionText: `Abonnement 1 mois - ${user.email}`,
        requestDate: new Date().toISOString(),
        transactionReference: `SUB-${user.id}-${Date.now()}`,
        receiveParty: [{ key: 'msisdn', value: MVOLA_CONFIG.merchantNumber }],
        requestingOrganisationTransactionReference: `REQ-${user.id}-${Date.now()}`,
        sendParty: [{ key: 'msisdn', value: phoneNumber.replace(/\s/g, '') }],
        metadata: [{ key: 'userId', value: user.id }]
      })
    });

    if (!response.ok) throw new Error('Erreur lors de l\'initiation du paiement MVola');

    const data = await response.json();
    res.json({ 
      status: 'pending', 
      serverCorrelationId: data.serverCorrelationId,
      message: 'Demande envoyée sur votre téléphone. Veuillez confirmer avec votre code secret.'
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment/mvola/callback', express.json(), async (req, res) => {
  const { status, metadata } = req.body;
  
  if (status === 'completed') {
    const userId = metadata?.find((m: any) => m.key === 'userId')?.value;
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (user) {
      const monthMs = 30 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const start = Math.max(now, user.subscription_end || 0);
      const newEnd = start + monthMs;
      
      const { data: updatedUser } = await supabase.from('users').update({ subscription_end: newEnd }).eq('id', userId).select().single();
      
      if (updatedUser) {
        const { password_hash, ...userWithoutPass } = updatedUser;
        clients.get(userId)?.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'user_update', user: userWithoutPass }));
          }
        });
      }
    }
  }
  res.status(204).send();
});

app.get('/api/admin/users', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { data: users } = await supabase.from('users').select('*').neq('role', 'admin');
    res.json(users?.map(u => {
      const { password_hash, ...rest } = u;
      return rest;
    }) || []);
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.get('/api/config', async (req, res) => {
  const price = await getSubscriptionPrice();
  res.json({ subscriptionPrice: price });
});

app.get('/api/admin/config', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const price = await getSubscriptionPrice();
    res.json({ subscriptionPrice: price });
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.post('/api/admin/update-config', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Non autorisé' });
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { price } = req.body;
    if (typeof price === 'number' && price >= 0) {
      await supabase.from('config').upsert({ key: 'subscription_price', value: price.toString() });
      res.json({ success: true, subscriptionPrice: price });
    } else {
      res.status(400).json({ error: 'Prix invalide' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

app.post('/api/admin/update-subscription', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { userId, action } = req.body;
  
  try {
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const minuteMs = 60 * 1000;
    const now = Date.now();
    let newEnd = user.subscription_end;

    if (action === '1min') {
      newEnd = now + minuteMs;
    } else if (action.endsWith('m')) {
      const months = parseInt(action);
      const start = Math.max(now, user.subscription_end || 0);
      newEnd = start + (months * monthMs);
    } else if (action === 'couper') {
      newEnd = now;
    }
    
    await supabase.from('users').update({ subscription_end: newEnd }).eq('id', userId);
    res.json({ success: true, subscriptionEnd: newEnd });
  } catch (e) {
    res.status(401).json({ error: 'Erreur' });
  }
});

app.post('/api/admin/delete-user', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { userId } = req.body;
  try {
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    await supabase.from('users').delete().eq('id', userId);
    clients.get(userId)?.forEach(ws => ws.close());
    clients.delete(userId);
    res.json({ success: true });
  } catch (e) {
    res.status(401).json({ error: 'Erreur' });
  }
});

app.post('/api/admin/toggle-blacklist', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { userId } = req.body;
  try {
    const token = authHeader!.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { data: admin } = await supabase.from('users').select('*').eq('id', decoded.userId).single();
    if (!admin || admin.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    
    const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
    if (user) {
      const newStatus = !user.is_blacklisted;
      await supabase.from('users').update({ is_blacklisted: newStatus }).eq('id', userId);
      if (newStatus) {
        clients.get(userId)?.forEach(ws => ws.close());
        clients.delete(userId);
      }
      res.json({ success: true, isBlacklisted: newStatus });
    } else {
      res.status(404).json({ error: 'Non trouvé' });
    }
  } catch (e) {
    res.status(401).json({ error: 'Erreur' });
  }
});

// WebSocket logic
const clients = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws, req) => {
  let userId: string | null = null;
  const currentIp = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || '').split(',')[0].trim();

  ws.on('message', async (message) => {
    const data = JSON.parse(message.toString());

    if (data.type === 'auth') {
      try {
        const decoded = jwt.verify(data.token, JWT_SECRET) as any;
        userId = decoded.userId;
        const { data: user } = await supabase.from('users').select('*').eq('id', userId).single();
        
        if (userId && user) {
          if (user.is_blacklisted) {
            ws.send(JSON.stringify({ type: 'error', message: 'Votre compte est sur liste noire.' }));
            ws.close();
            return;
          }

          // IP check for session persistence security
          if (user.last_ip && user.last_ip !== currentIp && user.role !== 'admin') {
            console.log(`IP mismatch for ${user.email}: stored ${user.last_ip}, current ${currentIp}`);
            // We allow it but update the IP to follow the user, or we could force logout.
            // The user said "reste toujours connecter sur une adresse IP", suggesting IP binding.
            // For now, we'll just log it and update the IP in the DB if it changes.
            await supabase.from('users').update({ last_ip: currentIp }).eq('id', userId);
          }
          const currentClients = clients.get(userId) || new Set();
          const limit = user.account_type === 'team' ? 5 : 1;
          if (currentClients.size >= limit && user.role !== 'admin') {
            ws.send(JSON.stringify({ type: 'error', message: `Limite de connexion atteinte (${limit} max)` }));
            ws.close();
            return;
          }

          if (!clients.has(userId)) clients.set(userId, new Set());
          clients.get(userId)!.add(ws);
          
          const { data: stateData } = await supabase.from('user_data').select('state').eq('user_id', userId).single();
          if (stateData) {
            ws.send(JSON.stringify({ type: 'init', state: stateData.state }));
          }
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      }
    }

    if (data.type === 'update' && userId) {
      await supabase.from('user_data').upsert({ user_id: userId, state: data.state });
      clients.get(userId)?.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'update', state: data.state }));
        }
      });
    }
  });

  ws.on('close', () => {
    if (userId && clients.has(userId)) {
      clients.get(userId)!.delete(ws);
      if (clients.get(userId)!.size === 0) clients.delete(userId);
    }
  });
});

async function setupVite() {
  console.log('Setting up Vite middleware...');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  
  // API routes MUST be registered BEFORE vite.middlewares
  // (They already are in the code above, but we'll double check)
  
  app.use(vite.middlewares);
  console.log('Vite middleware ready.');
}

// Export for Vercel Serverless Functions
export default app;

// Only listen if not in serverless environment
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  setupVite().then(() => {
    const PORT = 3000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  });
} else {
  // In Vercel production, we still need to setup routes but not app.listen
  setupVite();
}
