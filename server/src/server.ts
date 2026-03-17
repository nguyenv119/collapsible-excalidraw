import express from 'express';
import nodesRouter from './routes/nodes';

const app = express();

app.use(express.json());

app.use('/nodes', nodesRouter);
app.get('/edges', (_req, res) => res.json([]));

app.listen(3001, () => {
  console.log('Server on :3001');
});
