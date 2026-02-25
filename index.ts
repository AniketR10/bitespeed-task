import express from 'express';
import type { Request, Response } from 'express';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

type Contact = {
    id: number;
    phoneNumber: string | null;
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
    res.send("api is running");
});

app.post('/identify', async (req: Request, res: Response) : Promise<void> => {
    try {
        const {email, phoneNumber} = req.body;

        if(!email && !phoneNumber) {
            res.status(400).json({error: "email or phoneNumber must be provided"});
            return;
        }
        
        const reqEmail = email || null;
        const reqPhone = phoneNumber ? String(phoneNumber) : null;

        let matchingContacts;
        if(reqEmail && reqPhone) {
            matchingContacts = await sql`SELECT * FROM "Contact" WHERE email = ${reqEmail} OR "phoneNumber" = ${reqPhone}`;
        } else if (reqEmail) {
            matchingContacts = await sql`SELECT * FROM "Contact" WHERE email = ${reqEmail}`;
        } else {
            matchingContacts = await sql`SELECT * FROM "Contact" WHERE "phoneNumber" = ${reqPhone}`;
        }

        if(matchingContacts.length === 0) {
            const newContact = await sql`
            INSERT INTO "Contact" (email, "phoneNumber", "linkPrecedence")
            VALUES (${reqEmail}, ${reqPhone}, 'primary')
            RETURNING *
            `;

            res.status(200).json({
            contact: {
                primaryContatctId: newContact[0]?.id,
                emails: newContact[0]?.email ? [newContact[0].email] : [],
                phoneNumbers: newContact[0]?.phoneNumber ? [newContact[0].phoneNumber] : [],
                secondaryContactIds: []
             }
          });
          return;
        }

        const ids = new Set<number>();
        matchingContacts.forEach(c => {
            ids.add(c.id);
            if(c.linkedId) ids.add(c.linkedId);
        });
        const idArray = Array.from(ids);

        let cluster = await sql`
            SELECT * FROM "Contact"
            WHERE id = ANY(${idArray}::int[]) OR "linkedId" = ANY(${idArray}::int[])
        `;

        const primaries = cluster.filter(c => c.linkPrecedence === 'primary');
        primaries.sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
        let primaryContact = primaries[0];

        if(primaries.length > 1){
            const newPrimaries = primaries.slice(1);
            const newPrimaryIds = newPrimaries.map(p => p.id);
            
            await sql`
                UPDATE "Contact"
                SET "linkPrecedence" = 'secondary', "linkedId" = ${primaryContact?.id}, "updatedAt" = CURRENT_TIMESTAMP
                WHERE id = ANY(${newPrimaryIds}::int[]) OR "linkedId" = ANY(${newPrimaryIds}::int[])
            `;

            cluster = await sql`
                SELECT * FROM "Contact"
                WHERE id = ${primaryContact?.id} OR "linkedId" = ${primaryContact?.id}
            `;
        }
        const existingEmails = new Set(cluster.map(c => c.email).filter(Boolean));
        const existingPhones = new Set(cluster.map(c => c.phoneNumber).filter(Boolean));

        const hasNewEmail = reqEmail && !existingEmails.has(reqEmail);
        const hasNewPhone = reqPhone && !existingPhones.has(reqPhone);

        if(hasNewEmail || hasNewPhone) {
            const newSecondary = await sql`
                INSERT INTO "Contact" (email, "phoneNumber", "linkedId", "linkPrecedence")
                VALUES (${reqEmail}, ${reqPhone}, ${primaryContact?.id}, 'secondary')
                RETURNING *
            `;
            if (newSecondary && newSecondary.length > 0) {
                cluster.push(newSecondary[0]!);
            }
        }

        const emails = new Set([primaryContact?.email]);
        const phones = new Set([primaryContact?.phoneNumber]);
        const secondaryIds: number[] = [];

        cluster.forEach(c => {
            if(c.email) emails.add(c.email);
            if (c.phoneNumber) phones.add(c.phoneNumber);
            if(c.id !== primaryContact?.id) secondaryIds.push(c.id);
        });

        emails.delete(null);
        phones.delete(null);

        res.status(200).json({
            contact: {
                primaryContatctId: primaryContact?.id,
                emails: Array.from(emails),
                phoneNumbers: Array.from(phones),
                secondaryContactIds: secondaryIds
            }
        });

    } catch (err) {
        console.error("error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`server running on port ${PORT}`);
});


