const TASKMANAGER_WEBHOOK_URL = process.env.TASKMANAGER_WEBHOOK_URL as string;
const TASKMANAGER_WEBHOOK_SECRET = process.env.TASKMANAGER_WEBHOOK_SECRET as string;

interface LicenseStatusPayload {
    companyId: string;
    status: "active" | "inactive";
    licenseExpiresAt?: Date;
    plan?: string;
}

export async function notifyLicenseStatus(payload: LicenseStatusPayload): Promise<void> {
    if (!TASKMANAGER_WEBHOOK_URL || !TASKMANAGER_WEBHOOK_SECRET) {
        console.warn("[notifyLicenseStatus] Webhook não configurado, pulando notificação.");
        return;
    }

    try {
        const res = await fetch(TASKMANAGER_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-webhook-secret": TASKMANAGER_WEBHOOK_SECRET,
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            console.error(`[notifyLicenseStatus] Falha ao notificar TaskManagerSolve: ${res.status}`);
        }
    } catch (error) {
        console.error("[notifyLicenseStatus] Erro ao notificar TaskManagerSolve:", error);
    }
}