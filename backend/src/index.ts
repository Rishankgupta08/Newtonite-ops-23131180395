import "dotenv/config";
import express from "express";
import cors from "cors";

export const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT) || 4000;

if (require.main === module) {
  app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
}
