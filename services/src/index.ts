import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';

import healthRouter from './routes/health';
import sourcesRouter from './routes/sources';
import apifyRouter from './routes/apify';

const app = express();
const PORT = process.env.PORT || 3100;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/apify', apifyRouter);

app.listen(PORT, () => {
  console.log(`PropScout agent-api running on :${PORT}`);
});

export default app;
