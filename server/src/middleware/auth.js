const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nitmz-bus-tracker-dev-secret';

function createToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    hostelId: user.hostel_id || user.hostelId
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function requireAuth(allowedRoles = []) {
  return (req, res, next) => {
    let token = null;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Missing or invalid authorization header/token' });
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.auth = decoded;
      
      if (allowedRoles.length > 0 && !allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
      }
      
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

function requireApiKey() {
  return (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const validKey = process.env.API_SECRET_KEY;
    
    if (!apiKey || apiKey !== validKey) {
      return res.status(401).json({ error: 'Invalid API Key' });
    }
    next();
  };
}

module.exports = {
  createToken,
  requireAuth,
  requireApiKey
};
