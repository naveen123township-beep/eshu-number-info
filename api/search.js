const REDIS_URL = "https://fun-hamster-140785.upstash.io";
const REDIS_TOKEN = "gQAAAAAAAiXxAAIgcDEwMTI2ZTRiMDYyMDk0ODJmYmE0YzA0NzVhYzRjYjE0YQ";

async function redis(command, ...args) {
    const response = await fetch(`${REDIS_URL}/${command}/${args.map(encodeURIComponent).join('/')}`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await response.json();
    return data.result;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { action, q, password, number, code, credits, userId } = req.query;

    if (action === 'admin_login') {
        if (password === 'ESHU16') {
            return res.status(200).json({ success: true, message: '💎 Admin authenticated successfully.' });
        }
        return res.status(401).json({ success: false, message: '❌ Invalid Admin Password.' });
    }

    if (action === 'encrypt_number') {
        if (password !== 'ESHU16') return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (number) {
            const cleanNum = number.trim().slice(-10);
            await redis('SADD', 'encrypted_numbers', cleanNum);
            return res.status(200).json({ success: true, message: `🔒 Number ${cleanNum} encrypted successfully by Admin.` });
        }
        return res.status(400).json({ success: false, message: '⚠️ Number required.' });
    }

    if (action === 'decrypt_number') {
        if (password !== 'ESHU16') return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (number) {
            const cleanNum = number.trim().slice(-10);
            await redis('SREM', 'encrypted_numbers', cleanNum);
            return res.status(200).json({ success: true, message: `🔓 Number ${cleanNum} decrypted successfully.` });
        }
        return res.status(400).json({ success: false, message: '⚠️ Number required.' });
    }

    if (action === 'create_redeem') {
        if (password !== 'ESHU16') return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (code && credits) {
            const cleanCode = code.trim().toUpperCase();
            // Store code value and add to active redeem codes set tracker
            await redis('SET', `redeem:${cleanCode}`, credits);
            await redis('SADD', 'active_redeem_codes', cleanCode);
            return res.status(200).json({ success: true, message: `✨ Redeem code [ ${cleanCode} ] generated with ⚡ ${credits} credits successfully!` });
        }
        return res.status(400).json({ success: false, message: '⚠️ Code and credit amount required.' });
    }

    if (action === 'get_active_codes') {
        if (password !== 'ESHU16') return res.status(401).json({ success: false, message: 'Unauthorized' });
        const codes = await redis('SMEMBERS', 'active_redeem_codes');
        let codeList = [];
        if (codes && Array.isArray(codes)) {
            for (let c of codes) {
                let val = await redis('GET', `redeem:${c}`);
                if (val) {
                    codeList.push({ code: c, credits: val });
                } else {
                    // Clean up if expired/missing
                    await redis('SREM', 'active_redeem_codes', c);
                }
            }
        }
        return res.status(200).json({ success: true, codes: codeList });
    }

    if (action === 'redeem_code') {
        if (!userId) return res.status(400).json({ success: false, message: 'User ID required.' });
        if (code) {
            const cleanCode = code.trim().toUpperCase();
            const redeemVal = await redis('GET', `redeem:${cleanCode}`);
            if (redeemVal) {
                const addAmount = parseInt(redeemVal);
                await redis('DEL', `redeem:${cleanCode}`);
                await redis('SREM', 'active_redeem_codes', cleanCode); // Remove from active admin view
                
                const userCreditKey = `credits:${userId}`;
                const currentCredits = await redis('GET', userCreditKey);
                const newTotal = (parseInt(currentCredits) || 0) + addAmount;
                await redis('SET', userCreditKey, newTotal);

                return res.status(200).json({ 
                    success: true, 
                    creditsAdded: addAmount, 
                    totalCredits: newTotal,
                    message: `🎉 SUCCESS! Added ⚡ ${addAmount} Credits to your account!`
                });
            }
            return res.status(400).json({ success: false, message: '❌ Invalid or already claimed redeem voucher code.' });
        }
        return res.status(400).json({ success: false, message: '⚠️ Code required.' });
    }

    if (action === 'check_credits') {
        if (!userId) return res.status(400).json({ success: false, message: 'User ID required.' });
        
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const istDate = new Date(utc + (3600000 * 5.5));
        
        if (istDate.getHours() < 4) {
            istDate.setDate(istDate.getDate() - 1);
        }
        const cycleKey = istDate.toISOString().split('T')[0];

        const userResetKey = `reset:${userId}`;
        const lastReset = await redis('GET', userResetKey);
        const userCreditKey = `credits:${userId}`;

        if (lastReset !== cycleKey) {
            await redis('SET', userCreditKey, 2);
            await redis('SET', userResetKey, cycleKey);
            return res.status(200).json({ success: true, credits: 2 });
        }

        let userCredits = await redis('GET', userCreditKey);
        if (userCredits === null) {
            await redis('SET', userCreditKey, 2);
            await redis('SET', userResetKey, cycleKey);
            userCredits = 2;
        }

        return res.status(200).json({ success: true, credits: parseInt(userCredits) });
    }

    const qParam = q || req.query.q;
    const uidParam = userId || req.query.userId;

    if (!qParam || !uidParam) {
        return res.status(400).json({ success: false, message: 'Query "q" and "userId" are required.' });
    }

    let cleaned = qParam.replace(/\+91/g, '').replace(/[\s\-\(\)]/g, '');
    if (cleaned.length > 10) cleaned = cleaned.slice(-10);

    const isEncrypted = await redis('SISMEMBER', 'encrypted_numbers', cleaned);
    if (isEncrypted === 1) {
        return res.status(200).json({
            success: true,
            encrypted_by_admin: true,
            message: "🔒 Number is encrypted by admin contact 8123561579"
        });
    }

    const userCreditKey = `credits:${uidParam}`;
    let userCredits = parseInt(await redis('GET', userCreditKey) || 0);

    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istDate = new Date(utc + (3600000 * 5.5));
    if (istDate.getHours() < 4) istDate.setDate(istDate.getDate() - 1);
    const cycleKey = istDate.toISOString().split('T')[0];
    const userResetKey = `reset:${uidParam}`;
    const lastReset = await redis('GET', userResetKey);

    if (lastReset !== cycleKey) {
        userCredits = 2;
        await redis('SET', userCreditKey, 2);
        await redis('SET', userResetKey, cycleKey);
    }

    if (userCredits <= 0) {
        return res.status(200).json({ success: false, low_credits: true, message: '⚠️ Insufficient credits! Please top-up via redeem code or WhatsApp.' });
    }

    const remainingCredits = userCredits - 1;
    await redis('SET', userCreditKey, remainingCredits);

    const targetUrl = `https://devilswillrise.kotakmahindrabank9090.workers.dev/number?key=PROVIDER365&number=${cleaned}`;

    try {
        const apiResponse = await fetch(targetUrl);
        const data = await apiResponse.json();
        return res.status(200).json({ ...data, remainingCredits });
    } catch (error) {
        await redis('SET', userCreditKey, userCredits);
        return res.status(500).json({ success: false, message: '❌ Failed to connect to database server.' });
    }
}
