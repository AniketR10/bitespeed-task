import express from 'express';
import type { Request, Response } from 'express';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

type Contact = {
    id: number;
    phoneNumber: String | null;
    email: string | null;
    linkedId: number | null;
    linkPrecedence: "primary" | "secondary";
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
}

const app = express();
app.use(express.json());

const sql = neon(process.env.DB_URL!)

app.get('/', (req: Request, res: Response) => {
    res.send("api is running")
})

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`);
});


