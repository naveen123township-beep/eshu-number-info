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

    const { action, q, password, number, code, credits, userId, announcement } = req.query;

    if (action === 'admin_login') {
        if (password === 'ESHU16') {
            return res.status(200).json({ success: true, message: '💎 Admin authenticated successfully.' });
        }
        return res.status(401).json({ success: false, message: '❌ Invalid Admin Password.' });
    }

    if (action === 'update_announcement') {
        if (password !== 'ESHU16') return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (announcement !== undefined) {
            await redis('SET', 'global_announcement', announcement);
            return res.status(200).json({ success: true, message: '✨ Global announcement banner updated successfully!' });
        }
        return res.status(400).json({ success: false, message: '⚠️ Announcement text required.' });
    }

    if (action === 'get_announcement') {
        const text = await redis('GET', 'global_announcement');
        return res.status(200).json({ success: true, announcement: text || "🔥 Welcome to Eshu Intelligence Portal! Join our WhatsApp & Telegram for free redeem codes!" });
    }

    if (action === 'encrypt_number') {
        if (password !== 'ESHU16') return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (number) {
            let cleanNum = number.replace(/\+91/g, '').replace(/[\s\-\(\)]/g, '').trim();
            if (cleanNum.length > 10) cleanNum = cleanNum.slice(-10);
            await redis('SADD', 'encrypted_numbers', cleanNum);
            return res.status(200).json({ success: true, message: `🔒 Number ${cleanNum} encrypted successfully by Admin.` });
        }
        return res.status(400).json({ success: false, message: '⚠️ Number required.' });
    }

    if (action === 'decrypt_number') {
        if (password !== 'ESHU16') return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (number) {
            let cleanNum = number.replace(/\+91/g, '').replace(/[\s\-\(\)]/g, '').trim();
            if (cleanNum.length > 10) cleanNum = cleanNum.slice(-10);
            await redis('SREM', 'encrypted_numbers', cleanNum);
            return res.status(200).json({ success: true, message: `🔓 Number ${cleanNum} decrypted successfully.` });
        }
        return res.status(400).json({ success: false, message: '⚠️ Number required.' });
    }

    if (action === 'get_encrypted_list') {
        if (password !== 'ESHU16') return res.status(401).json({ success: false, message: 'Unauthorized' });
        const encryptedList = await redis('SMEMBERS', 'encrypted_numbers');
        return res.status(200).json({ success: true, numbers: encryptedList || [] });
    }

    if (action === 'create_redeem') {
        if (password !== 'ESHU16') return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (code && credits) {
            const cleanCode = code.trim().toUpperCase();
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
                await redis('SREM', 'active_redeem_codes', cleanCode);
                
                const bonusKey = `bonus_credits:${userId}`;
                const currentBonus = parseInt(await redis('GET', bonusKey) || 0);
                const newBonusTotal = currentBonus + addAmount;
                await redis('SET', bonusKey, newBonusTotal);

                // Calculate combined total for user response
                const now = new Date();
                const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
                const istDate = new Date(utc + (3600000 * 5.5));
                if (istDate.getHours() < 4) istDate.setDate(istDate.getDate() - 1);
                const cycleKey = istDate.toISOString().split('T')[0];
                const userResetKey = `reset:${userId}`;
                const lastReset = await redis('GET', userResetKey);

                let dailyLeft = 2;
                if (lastReset === cycleKey) {
                    dailyLeft = parseInt(await redis('GET', `daily_credits:${userId}`) ?? 2);
                }

                return res.status(200).json({ 
                    success: true, 
                    creditsAdded: addAmount, 
                    totalCredits: dailyLeft + newBonusTotal,
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
        const dailyKey = `daily_credits:${userId}`;
        const bonusKey = `bonus_credits:${userId}`;

        let dailyLeft = 2;
        if (lastReset !== cycleKey) {
            await redis('SET', dailyKey, 2);
            await redis('SET', userResetKey, cycleKey);
            dailyLeft = 2;
        } else {
            let val = await redis('GET', dailyKey);
            if (val === null) {
                await redis('SET', dailyKey, 2);
                dailyLeft = 2;
            } else {
                dailyLeft = parseInt(val);
            }
        }

        const bonusLeft = parseInt(await redis('GET', bonusKey) || 0);
        return res.status(200).json({ success: true, credits: dailyLeft + bonusLeft });
    }

    if (action === 'deduct_credit') {
        if (!userId) return res.status(400).json({ success: false, message: 'User ID required.' });

        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const istDate = new Date(utc + (3600000 * 5.5));
        if (istDate.getHours() < 4) istDate.setDate(istDate.getDate() - 1);
        const cycleKey = istDate.toISOString().split('T')[0];

        const userResetKey = `reset:${userId}`;
        const lastReset = await redis('GET', userResetKey);
        const dailyKey = `daily_credits:${userId}`;
        const bonusKey = `bonus_credits:${userId}`;

        let dailyLeft = 2;
        if (lastReset !== cycleKey) {
            await redis('SET', dailyKey, 2);
            await redis('SET', userResetKey, cycleKey);
            dailyLeft = 2;
        } else {
            dailyLeft = parseInt(await redis('GET', dailyKey) ?? 2);
        }

        let bonusLeft = parseInt(await redis('GET', bonusKey) || 0);
        let totalCredits = dailyLeft + bonusLeft;

        if (totalCredits <= 0) {
            return res.status(200).json({ success: false, low_credits: true, message: '⚠️ Insufficient credits!' });
        }

        // Deduct from daily credits first, then bonus credits
        if (dailyLeft > 0) {
            dailyLeft -= 1;
            await redis('SET', dailyKey, dailyLeft);
        } else if (bonusLeft > 0) {
            bonusLeft -= 1;
            await redis('SET', bonusKey, bonusLeft);
        }

        return res.status(200).json({ success: true, credits: dailyLeft + bonusLeft });
    }

    if (action === 'check_encryption') {
        const qParam = q;
        if (!qParam) return res.status(400).json({ encrypted: false });
        let cleaned = qParam.replace(/\+91/g, '').replace(/[\s\-\(\)]/g, '').trim();
        if (cleaned.length > 10) cleaned = cleaned.slice(-10);

        const isEncrypted = await redis('SISMEMBER', 'encrypted_numbers', cleaned);
        if (isEncrypted === 1) {
            return res.status(200).json({ 
                encrypted: true, 
                message: "Number is encrypted contact admin 8123561579" 
            });
        }
        return res.status(200).json({ encrypted: false });
    }

    return res.status(400).json({ success: false, message: 'Invalid action.' });
}
