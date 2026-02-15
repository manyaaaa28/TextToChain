import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import routes from './api/routes';
import ensRoutes from './api/ens-routes';
import { TelcoFactory } from './telco/TelcoFactory';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8082;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for local testing
  crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Initialize telco operators
TelcoFactory.initialize();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'airtime-service',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api', routes);
app.use('/api/ens', ensRoutes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║   TXTC Airtime Service                    ║
║   Port: ${PORT}                              ║
║   Environment: ${process.env.NODE_ENV || 'development'}            ║
╚═══════════════════════════════════════════╝

📱 Endpoints:
   POST   /api/airtime/buy
   GET    /api/airtime/balance/:phoneNumber
   GET    /api/balance/:phoneNumber
   GET    /api/transactions/:phoneNumber
   POST   /api/webhooks/payment
   POST   /api/ussd/callback
   POST   /api/ens/register

🔧 Telco operators initialized
✅ Server ready!
  `);
});

export default app;
