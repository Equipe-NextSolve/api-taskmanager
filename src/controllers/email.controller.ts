import { Request, Response } from "express";
import { z } from "zod";

const sendInviteSchema = z.object({
    to: z.string().email(),
    inviteeName: z.string().min(1),
    companyName: z.string().min(1),
    inviterName: z.string().min(1),
    inviteLink: z.string().url(),
});

export const sendInviteEmail = async (req: Request, res: Response): Promise<void> => {
    const result = sendInviteSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: "Dados inválidos.", details: result.error.flatten() });
        return;
    }

    const { to, inviteeName, companyName, inviterName, inviteLink } = result.data;

    try {
        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "api-key": process.env.BREVO_API_KEY ?? "",
            },
            body: JSON.stringify({
                sender: {
                    name: process.env.BREVO_FROM_NAME ?? "Task Manager Solve",
                    email: process.env.BREVO_FROM_EMAIL,
                },
                to: [{ email: to, name: inviteeName }],
                subject: `${inviterName} te convidou para o Task Manager Solve`,
                htmlContent: `
                    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                        <h2>Olá, ${inviteeName}!</h2>
                        <p><strong>${inviterName}</strong> te convidou para entrar na equipe de <strong>${companyName}</strong> no Task Manager Solve.</p>
                        <p style="margin: 24px 0;">
                            <a href="${inviteLink}" style="background:#19CA68;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
                                Aceitar convite
                            </a>
                        </p>
                        <p style="color:#666;font-size:13px;">Se você não esperava este convite, pode ignorar este e-mail.</p>
                    </div>
                `,
            }),
        });

        if (!brevoRes.ok) {
            const errText = await brevoRes.text();
            console.error("[email] Brevo recusou o envio:", errText);
            res.status(502).json({ error: "Erro ao enviar e-mail." });
            return;
        }

        res.status(200).json({ ok: true });
    } catch (error) {
        console.error("[email] Erro ao enviar convite:", error);
        res.status(502).json({ error: "Erro ao enviar e-mail." });
    }
};