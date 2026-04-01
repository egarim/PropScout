import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

import healthRouter from './routes/health';
import sourcesRouter from './routes/sources';
import apifyRouter from './routes/apify';
import propertiesRouter from './routes/properties';
import agentRouter from './routes/agent';
import imagesRouter from './routes/images';
import analyticsRouter from './routes/analytics';

const app = express();
const PORT = process.env.PORT || 3100;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/apify', apifyRouter);
app.use('/api/properties', propertiesRouter);
app.use('/api/agent', agentRouter);
app.use('/api/images', imagesRouter);
app.use('/api/analytics', analyticsRouter);

app.listen(PORT, () => {
  console.log(`PropScout agent-api running on :${PORT}`);
});

export default app;
