const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder,
    ComponentType
} = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN || typeof TOKEN !== 'string' || TOKEN.trim() === '') {
    console.error('[FATAL] DISCORD_TOKEN không tồn tại hoặc không hợp lệ.');
    process.exit(1);
}

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const OWNER_ID = '1208450889246048306';

const FOOTER_ICON_URL = 'https://i.postimg.cc/gJbhCmHL/Pain-Gamer.png';
const SECRET_KEY = "PainGamerSecretKey2156#VipTool";

const COLORS = {
    SUCCESS: 0x2ECC71,
    ERROR: 0xE74C3C,
    WARNING: 0xF39C12,
    INFO: 0x3498DB,
    PURPLE: 0x9B59B6,
    GOLD: 0xF1C40F,
    DARK_BLUE: 0x1e3a8a,
    LIGHT_BLUE: 0x0ea5e9,
    EMERALD: 0x10b981,
    ROSE: 0xf43f5e,
    SLATE: 0x64748b
};

class EmbedFactory {
    static createSuccess(title, description, thumbnail = null) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.SUCCESS)
            .setTitle(`✅ ${title}`)
            .setDescription(description)
            .setFooter(getFooterOptions())
            .setTimestamp();
        
        if (thumbnail) embed.setThumbnail(thumbnail);
        return embed;
    }

    static createError(title, description, thumbnail = null) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.ERROR)
            .setTitle(`❌ ${title}`)
            .setDescription(description)
            .setFooter(getFooterOptions())
            .setTimestamp();
        
        if (thumbnail) embed.setThumbnail(thumbnail);
        return embed;
    }

    static createWarning(title, description, thumbnail = null) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle(`⚠️ ${title}`)
            .setDescription(description)
            .setFooter(getFooterOptions())
            .setTimestamp();
        
        if (thumbnail) embed.setThumbnail(thumbnail);
        return embed;
    }

    static createInfo(title, description, thumbnail = null) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.INFO)
            .setTitle(`ℹ️ ${title}`)
            .setDescription(description)
            .setFooter(getFooterOptions())
            .setTimestamp();
        
        if (thumbnail) embed.setThumbnail(thumbnail);
        return embed;
    }

    static createPremium(title, description, thumbnail = null) {
        const embed = new EmbedBuilder()
            .setColor(COLORS.GOLD)
            .setTitle(`💎 ${title}`)
            .setDescription(description)
            .setFooter(getFooterOptions())
            .setTimestamp();
        
        if (thumbnail) embed.setThumbnail(thumbnail);
        return embed;
    }

    static createKeyDetail(keyData, userAvatar, currentNow) {
        const expireText = keyData.expires_at === 0 
            ? '♾️ **Vĩnh Viễn**' 
            : (keyData.expires_at > currentNow 
                ? `<t:${Math.floor(keyData.expires_at / 1000)}:R>` 
                : '⏰ Đã hết hạn');

        const hwidStatus = keyData.hwid 
            ? '🔒 **Đã Liên Kết**' 
            : '🔓 Chưa Liên Kết';

        const cooldown = 24 * 60 * 60 * 1000;
        let resetStatusText = '🟢 Sẵn sàng reset';

        if (keyData.last_reset && (currentNow - keyData.last_reset < cooldown)) {
            const diffMs = cooldown - (currentNow - keyData.last_reset);
            const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
            const minsLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            resetStatusText = `🔴 ${hoursLeft}h ${minsLeft}m còn lại`;
        }

        return new EmbedBuilder()
            .setColor(COLORS.DARK_BLUE)
            .setTitle('🔑 Chi Tiết Key')
            .setThumbnail(userAvatar)
            .addFields(
                { name: '🔐 Mã Key', value: keyData.assigned_key, inline: false },
                { name: '🖥️ HWID', value: keyData.hwid || 'N/A', inline: false },
                { name: '⌛ Hạn Sử Dụng', value: expireText, inline: true },
                { name: '📊 Trạng Thái', value: hwidStatus, inline: true },
                { name: '🔄 Reset HWID', value: resetStatusText, inline: false }
            )
            .setFooter(getFooterOptions())
            .setTimestamp();
    }

    static createOwnerNotification(userId, userTag, inputKey, assignedKey, userAvatar) {
        return new EmbedBuilder()
            .setColor(COLORS.EMERALD)
            .setTitle('🔔 Member Kích Hoạt Key')
            .setThumbnail(userAvatar)
            .addFields(
                { name: '👤 Thành Viên', value: `<@${userId}> (\`${userTag}\`)`, inline: false },
                { name: '📋 Key Gốc', value: inputKey, inline: false },
                { name: '🎯 Tool Key Được Cấp', value: assignedKey, inline: false }
            )
            .setFooter(getFooterOptions())
            .setTimestamp();
    }

    static createNewKeyNotification(key, duration, userAvatar) {
        const durationText = duration === '0' ? 'Vĩnh viễn' : `${duration} ngày`;
        
        return new EmbedBuilder()
            .setColor(COLORS.GOLD)
            .setTitle('💎 Key Bản Quyền Mới')
            .setDescription(`Bạn đã nhận được key mới. Sao chép key dưới đây để sử dụng:`)
            .setThumbnail(userAvatar)
            .addFields(
                { name: '🔐 Key', value: key, inline: false },
                { name: '⏱️ Thời Hạn', value: durationText, inline: true }
            )
            .setFooter(getFooterOptions())
            .setTimestamp();
    }

    static createResetTokenNotification(token, userAvatar) {
        return new EmbedBuilder()
            .setColor(COLORS.LIGHT_BLUE)
            .setTitle('🔑 Token Reset HWID')
            .setDescription(`Token này cho phép bạn reset HWID mà không cần chờ cooldown.`)
            .setThumbnail(userAvatar)
            .addFields(
                { name: '🎫 Token', value: token, inline: false },
                { name: '⚠️ Lưu Ý', value: 'Token này chỉ sử dụng được 1 lần', inline: false }
            )
            .setFooter(getFooterOptions())
            .setTimestamp();
    }

    static createKeyExpiredNotification(assignedKey, durationText, userAvatar) {
        return new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('⏰ Key Đã Hết Hạn')
            .setDescription(`Key của bạn đã hết hạn và bị xóa khỏi hệ thống.`)
            .setThumbnail(userAvatar)
            .addFields(
                { name: '🔐 Mã Key', value: assignedKey, inline: false },
                { name: '⏱️ Thời Hạn Đã Dùng', value: durationText, inline: true }
            )
            .setFooter(getFooterOptions())
            .setTimestamp();
    }
}

const getFooterOptions = () => {
    return {
        text: 'Bot By PAIN • Professional Key System',
        iconURL: FOOTER_ICON_URL
    };
};

async function notifyOwner(client, embed) {
    try {
        const owner = await client.users.fetch(OWNER_ID);
        if (owner) {
            await owner.send({ embeds: [embed] });
            console.log('✅ Owner notification sent.');
        }
    } catch (e) {
        console.error('❌ Error sending DM to Owner:', e.message);
    }
}

async function notifyUserDM(client, userId, embed) {
    try {
        const user = await client.users.fetch(userId);
        if (user) {
            await user.send({ embeds: [embed] });
            console.log(`✅ DM notification sent to user ${userId}.`);
        }
    } catch (e) {
        console.error(`❌ Error sending DM to user ${userId}:`, e.message);
    }
}

const adminSchema = new mongoose.Schema({ user_id: String });
const Admin = mongoose.model('Admin', adminSchema);

const tokenSchema = new mongoose.Schema({
    token_str: { type: String, required: true, unique: true },
    created_by: { type: String, required: true },
    is_used: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now }
});
const Token = mongoose.model('Token', tokenSchema);

const keySchema = new mongoose.Schema({
    key: String,
    assigned_key: { type: String, default: null, unique: true, sparse: true },
    hwid: { type: String, default: null },
    expires_at: { type: Number, default: 0 },
    duration_days: { type: Number, default: 0 },
    user_id: { type: String, default: null },
    is_used: { type: Number, default: 0 },
    last_reset: { type: Number, default: 0 },
    notified_24h: { type: Boolean, default: false },
    notified_4h: { type: Boolean, default: false }
});
const Key = mongoose.model('Key', keySchema);

console.log('🔄 Connecting to MongoDB Atlas...');
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB connected successfully!'))
    .catch(err => console.error('❌ MongoDB error:', err));

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send('Bot is active and running successfully!');
});

app.post(['/', '/api/verify'], async (req, res) => {
    const { key, hwid, timestamp, signature } = req.body;
    try {
        if (!key || !hwid || !timestamp || !signature) {
            return res.json({ valid: false, reason: "missing_data" });
        }

        const currentTime = Math.floor(Date.now() / 1000);
        if (Math.abs(currentTime - timestamp) > 30) {
            return res.json({ valid: false, reason: "request_expired" });
        }

        const rawData = `${key}:${hwid}:${timestamp}`;
        const expectedSignature = crypto
            .createHmac('sha256', SECRET_KEY)
            .update(rawData)
            .digest('hex');

        if (signature !== expectedSignature) {
            return res.json({ valid: false, reason: "invalid_signature" });
        }

        const row = await Key.findOne({ assigned_key: key });
        if (!row) return res.json({ valid: false, reason: "key_not_found" });
        if (row.expires_at !== 0 && Date.now() > row.expires_at) return res.json({ valid: false, reason: "expired" });
        
        if (!row.hwid) {
            row.hwid = hwid;
            await row.save();
        } else if (row.hwid !== hwid) {
            return res.json({ valid: false, reason: "hwid_mismatch" });
        }

        const premiumFilePath = path.join(__dirname, 'paintool_premium.py');
        if (!fs.existsSync(premiumFilePath)) {
            return res.json({ valid: false, reason: "source_code_not_found" });
        }

        const rawCode = fs.readFileSync(premiumFilePath, 'utf8');
        const encodedCode = Buffer.from(rawCode).toString('base64');

        return res.json({ 
            valid: true, 
            code: encodedCode 
        });

    } catch (e) { 
        console.error("❌ Verify API Error:", e);
        res.json({ valid: false, reason: "server_error" }); 
    }
});

app.post('/api/link-hwid', async (req, res) => {
    const { key, hwid, timestamp, signature, discord_id } = req.body;
    try {
        if (!key || !hwid || !timestamp || !signature) {
            return res.json({ success: false, reason: "missing_data" });
        }

        const currentTime = Math.floor(Date.now() / 1000);
        if (Math.abs(currentTime - timestamp) > 30) {
            return res.json({ success: false, reason: "request_expired" });
        }

        const rawData = `${key}:${hwid}:${timestamp}`;
        const expectedSignature = crypto
            .createHmac('sha256', SECRET_KEY)
            .update(rawData)
            .digest('hex');

        if (signature !== expectedSignature) {
            return res.json({ success: false, reason: "invalid_signature" });
        }

        const row = await Key.findOne({ assigned_key: key });
        if (!row) return res.json({ success: false, reason: "key_not_found" });

        if (!row.hwid || row.hwid !== hwid) {
            row.hwid = hwid;
            if (discord_id && !row.user_id) {
                row.user_id = discord_id;
            }
            await row.save();
            console.log(`✅ HWID updated for key ${key.substring(0, 8)}... | Device: ${hwid.substring(0, 12)}...`);
        }

        return res.json({ 
            success: true, 
            message: "HWID linked successfully" 
        });

    } catch (e) {
        console.error("❌ Link HWID Error:", e);
        res.json({ success: false, reason: "server_error" });
    }
});

async function checkExpiredKeys(client) {
    try {
        const now = Date.now();
        
        const expiredKeys = await Key.find({
            $or: [
                { is_used: 1, assigned_key: { $ne: null } },
                { assigned_key: { $ne: null } }
            ],
            expires_at: { $gt: 0, $lt: now }
        });

        for (const keyDoc of expiredKeys) {
            const user = await client.users.fetch(keyDoc.user_id).catch(() => null);
            
            if (user) {
                const durationDays = keyDoc.duration_days || 0;
                const durationText = durationDays === 0 ? 'Vĩnh viễn' : `${durationDays} ngày`;
                const expiredEmbed = EmbedFactory.createKeyExpiredNotification(
                    keyDoc.assigned_key,
                    durationText,
                    user.displayAvatarURL({ dynamic: true })
                );
                await user.send({ embeds: [expiredEmbed] }).catch(() => {});
            }

            await Key.deleteOne({ _id: keyDoc._id });
            console.log(`✅ Expired key deleted: ${keyDoc.assigned_key.substring(0, 8)}...`);
        }
    } catch (e) {
        console.error("❌ Check Expired Keys Error:", e);
    }
}

async function generateUniqueAssignedKey() {
    let newKey = crypto.randomBytes(16).toString('hex').toUpperCase();
    newKey = `pain_key_${newKey.substring(0, 20)}`;
    
    let existingKey = await Key.findOne({ assigned_key: newKey });
    while (existingKey) {
        newKey = crypto.randomBytes(16).toString('hex').toUpperCase();
        newKey = `pain_key_${newKey.substring(0, 20)}`;
        existingKey = await Key.findOne({ assigned_key: newKey });
    }
    
    return newKey;
}

const client = new Client({ 
    intents: [ 
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ] 
});

const cooldowns = new Map();
const COOLDOWN_TIME = 5000; 

const commands = [
    new SlashCommandBuilder().setName('setadmin').setDescription('Quản lý admin')
        .addStringOption(opt => opt.setName('action').setDescription('Thao tác').setRequired(true).addChoices({ name: 'Thêm Admin', value: 'add' }, { name: 'Xóa Admin', value: 'remove' }))
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)),
    new SlashCommandBuilder().setName('createkey').setDescription('Tạo key bản quyền')
        .addStringOption(opt => opt.setName('duration').setDescription('Thời hạn').setRequired(true).addChoices({name: '1 Ngày', value: '1'}, {name: '3 Ngày', value: '3'}, {name: '7 Ngày', value: '7'}, {name: '30 Ngày', value: '30'}, {name: 'Vĩnh viễn', value: '0'}))
        .addUserOption(opt => opt.setName('user').setDescription('Nhận key qua DM').setRequired(false)),
    new SlashCommandBuilder().setName('gettoken').setDescription('Tạo token reset HWID')
        .addUserOption(opt => opt.setName('user').setDescription('Nhận token qua DM').setRequired(false)),
    new SlashCommandBuilder().setName('getkey').setDescription('Lấy key và xem thống kê'),
    new SlashCommandBuilder().setName('removekey').setDescription('Xóa key (Chỉ Owner)')
        .addStringOption(opt => opt.setName('toolkey').setDescription('Tool key hoặc mã key gốc').setRequired(true)),
    new SlashCommandBuilder().setName('resethwid').setDescription('Reset HWID')
        .addStringOption(opt => opt.setName('key').setDescription('Chọn key của bạn').setRequired(true).setAutocomplete(true))
        .addStringOption(opt => opt.setName('token').setDescription('Token (Tùy chọn)').setRequired(false)),
    new SlashCommandBuilder().setName('activatekey').setDescription('Kích hoạt key')
        .addStringOption(opt => opt.setName('key').setDescription('Key cấp phép').setRequired(true).setAutocomplete(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 Registering slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log('✅ Slash commands registered.');
    } catch (error) {
        console.error('❌ Command registration error:', error);
    }
})();

client.on('ready', () => {
    console.log(`🤖 Bot logged in as ${client.user.tag}`);
    
    setInterval(() => {
        checkExpiredKeys(client);
    }, 60 * 1000);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
        const userId = interaction.user.id;
        const userAvatar = interaction.user.displayAvatarURL({ dynamic: true });
        const commandName = interaction.commandName;

        if (cooldowns.has(userId)) {
            return interaction.reply({
                content: '⏱️ Bạn đang sử dụng lệnh quá nhanh, vui lòng đợi...',
                ephemeral: true
            });
        }

        cooldowns.set(userId, true);
        setTimeout(() => cooldowns.delete(userId), COOLDOWN_TIME);

        await interaction.deferReply({ ephemeral: true });

        if (commandName === 'setadmin') {
            if (userId !== OWNER_ID) {
                return interaction.editReply({ 
                    embeds: [EmbedFactory.createError('Quyền Hạn', '❌ Chỉ Owner có quyền!', userAvatar)] 
                });
            }

            const action = interaction.options.getString('action');
            const targetUser = interaction.options.getUser('user');
            const targetUserId = targetUser.id;

            if (action === 'add') {
                const existingAdmin = await Admin.findOne({ user_id: targetUserId });
                if (existingAdmin) {
                    return interaction.editReply({ 
                        embeds: [EmbedFactory.createError('Tồn Tại', '❌ User này đã là admin rồi!', userAvatar)] 
                    });
                }

                const newAdmin = new Admin({ user_id: targetUserId });
                await newAdmin.save();

                await interaction.editReply({ 
                    embeds: [EmbedFactory.createSuccess('Thêm Admin', `✅ <@${targetUserId}> đã được thêm làm admin!`, userAvatar)] 
                });
            } else if (action === 'remove') {
                const result = await Admin.deleteOne({ user_id: targetUserId });
                if (result.deletedCount === 0) {
                    return interaction.editReply({ 
                        embeds: [EmbedFactory.createError('Không Tìm Thấy', '❌ User này không phải admin!', userAvatar)] 
                    });
                }

                await interaction.editReply({ 
                    embeds: [EmbedFactory.createSuccess('Xóa Admin', `✅ <@${targetUserId}> đã bị xóa khỏi admin!`, userAvatar)] 
                });
            }
        }

        else if (commandName === 'removekey') {
            if (userId !== OWNER_ID) {
                return interaction.editReply({ 
                    embeds: [EmbedFactory.createError('Quyền Hạn', '❌ Chỉ Owner có quyền xóa key!', userAvatar)] 
                });
            }

            const toolKey = interaction.options.getString('toolkey');
            
            let result = await Key.deleteOne({ assigned_key: toolKey });
            
            if (result.deletedCount === 0) {
                result = await Key.deleteOne({ key: toolKey });
            }

            if (result.deletedCount === 0) {
                return interaction.editReply({ 
                    embeds: [EmbedFactory.createError('Không Tìm Thấy', '❌ Key này không tồn tại!', userAvatar)] 
                });
            }

            await interaction.editReply({ 
                embeds: [EmbedFactory.createSuccess('Xóa Key Thành Công', `✅ Key đã được xóa khỏi hệ thống!`, userAvatar)] 
            });
        }

        else if (commandName === 'activatekey') {
            const inputKey = interaction.options.getString('key');
            const row = await Key.findOne({ key: inputKey });

            if (!row) {
                return interaction.editReply({ 
                    embeds: [EmbedFactory.createError('Key Không Hợp Lệ', 'Key này không tồn tại trong hệ thống!', userAvatar)] 
                });
            }

            if (row.is_used) {
                return interaction.editReply({ 
                    embeds: [EmbedFactory.createError('Key Đã Sử Dụng', 'Key này đã được kích hoạt trước đó!', userAvatar)] 
                });
            }

            const assignedKey = await generateUniqueAssignedKey();
            
            row.assigned_key = assignedKey;
            row.user_id = userId;
            row.is_used = 1;
            
            if (row.duration_days !== 0) {
                row.expires_at = Date.now() + (row.duration_days * 24 * 60 * 60 * 1000);
            }
            
            row.notified_24h = false;
            row.notified_4h = false;
            await row.save();

            // Respond immediately in channel
            await interaction.editReply({ 
                embeds: [EmbedFactory.createSuccess('Kích Hoạt Thành Công', `✅ Key: ${assignedKey}`, userAvatar)] 
            });

            // Send notification to owner
            const ownerEmbed = EmbedFactory.createOwnerNotification(userId, interaction.user.tag, inputKey, assignedKey, userAvatar);
            await notifyOwner(client, ownerEmbed);

            // Send key to member via DM
            const memberEmbed = EmbedFactory.createNewKeyNotification(assignedKey, row.duration_days.toString(), userAvatar);
            await notifyUserDM(client, userId, memberEmbed);
        }

        else if (commandName === 'resethwid') {
            const inputKey = interaction.options.getString('key');
            const tokenInput = interaction.options.getString('token');
            const row = await Key.findOne({ assigned_key: inputKey, user_id: userId });
            
            if (!row) {
                return interaction.editReply({ 
                    embeds: [EmbedFactory.createError('Key Không Hợp Lệ', 'Key không hợp lệ hoặc không thuộc sở hữu của bạn!', userAvatar)] 
                });
            }

            const now = Date.now();
            if (row.expires_at !== 0 && now > row.expires_at) {
                await Key.deleteOne({ _id: row._id });
                return interaction.editReply({ 
                    embeds: [EmbedFactory.createError('Key Hết Hạn', 'Key của bạn đã hết hạn và bị xóa khỏi hệ thống!', userAvatar)] 
                });
            }

            const cooldown = 24 * 60 * 60 * 1000;

            if (tokenInput) {
                const tokenDoc = await Token.findOne({ token_str: tokenInput });
                
                if (!tokenDoc) {
                    return interaction.editReply({ 
                        embeds: [EmbedFactory.createError('Token Không Hợp Lệ', '❌ Token không tồn tại hoặc không hợp lệ!', userAvatar)] 
                    });
                }

                if (tokenDoc.is_used) {
                    return interaction.editReply({ 
                        embeds: [EmbedFactory.createError('Token Đã Sử Dụng', '❌ Token này đã được sử dụng rồi!', userAvatar)] 
                    });
                }

                row.hwid = null;
                await row.save();

                tokenDoc.is_used = true;
                await tokenDoc.save();

                await interaction.editReply({ 
                    embeds: [EmbedFactory.createSuccess('Reset HWID Thành Công', '✅ Đã reset phần cứng thành công (Token đã được dùng)!', userAvatar)] 
                });
            } else {
                if (row.last_reset && (now - row.last_reset < cooldown)) {
                    const hoursLeft = Math.ceil((cooldown - (now - row.last_reset)) / 3600000);
                    return interaction.editReply({ 
                        embeds: [EmbedFactory.createWarning('Đang Chờ Cooldown', `Vui lòng đợi thêm **${hoursLeft} giờ** nữa để reset HWID hoặc dùng token cấp phép.`, userAvatar)] 
                    });
                }

                row.hwid = null;
                row.last_reset = now;
                await row.save();

                await interaction.editReply({ 
                    embeds: [EmbedFactory.createSuccess('Reset HWID Thành Công', '✅ Đã reset phần cứng thành công!', userAvatar)] 
                });
            }
        }

        else if (commandName === 'getkey') {
            const now = Date.now();

            const userKeys = await Key.find({ 
                user_id: userId, 
                assigned_key: { $ne: null },
                $or: [
                    { expires_at: 0 },
                    { expires_at: { $gt: now } }
                ]
            });

            if (!userKeys.length) {
                return interaction.editReply({ 
                    embeds: [EmbedFactory.createError('Không Tìm Thấy Key', '❌ Bạn chưa sở hữu key nào.', userAvatar)] 
                });
            }

            const publicEmbed = new EmbedBuilder()
                .setColor(COLORS.DARK_BLUE)
                .setTitle('🔑 Quản Lý Key')
                .setDescription('Chọn key từ menu bên dưới để xem chi tiết và trạng thái.')
                .setThumbnail(userAvatar)
                .setFooter(getFooterOptions())
                .setTimestamp();

            const customSelectId = `select_getkey_${userId}`;

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(customSelectId)
                .setPlaceholder('Chọn key của bạn...')
                .addOptions(
                    userKeys.slice(0, 25).map((k, idx) => ({
                        label: `Key #${idx + 1} • ${k.assigned_key.substring(0, 8)}...`,
                        description: k.hwid ? '✅ HWID Linked' : '❌ No HWID',
                        value: k.assigned_key
                    }))
                );

            const rowComponent = new ActionRowBuilder().addComponents(selectMenu);

            const responseMessage = await interaction.editReply({ 
                embeds: [publicEmbed], 
                components: [rowComponent] 
            });

            const collector = responseMessage.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 5 * 60 * 1000
            });

            collector.on('collect', async i => {
                if (i.user.id !== userId) {
                    return i.reply({
                        content: '❌ Bạn không thể thao tác menu của người khác!',
                        ephemeral: true
                    });
                }

                const selectedKeyStr = i.values[0];
                const row = await Key.findOne({ assigned_key: selectedKeyStr, user_id: userId });
                const currentNow = Date.now();
                
                if (!row || row.user_id !== userId || (row.expires_at !== 0 && currentNow > row.expires_at)) {
                    if (row && row.expires_at !== 0 && currentNow > row.expires_at) {
                        await Key.deleteOne({ _id: row._id });
                    }
                    return i.reply({ 
                        content: '❌ Key đã hết hạn hoặc không tồn tại!', 
                        ephemeral: true 
                    });
                }

                const detailEmbed = EmbedFactory.createKeyDetail(row, i.user.displayAvatarURL({ dynamic: true }), currentNow);
                await i.reply({ embeds: [detailEmbed], ephemeral: true });
            });

            collector.on('end', async () => {
                try {
                    const disabledMenu = StringSelectMenuBuilder.from(selectMenu)
                        .setDisabled(true)
                        .setPlaceholder('❌ Menu hết hiệu lực');
                    
                    const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);
                    await interaction.editReply({ components: [disabledRow] });
                } catch (e) {}
            });
        }

        else if (commandName === 'createkey') {
            const duration = interaction.options.getString('duration');
            const targetUser = interaction.options.getUser('user');
            const targetUserId = targetUser ? targetUser.id : userId;

            const isAdmin = await Admin.findOne({ user_id: userId });
            if (userId !== OWNER_ID && !isAdmin) {
                return interaction.editReply({ 
                    embeds: [EmbedFactory.createError('Quyền Hạn', '❌ Chỉ admin có thể tạo key!', userAvatar)] 
                });
            }

            const newKey = crypto.randomBytes(16).toString('hex').toUpperCase();

            const keyDoc = new Key({
                key: newKey,
                assigned_key: null,
                expires_at: 0,
                duration_days: parseInt(duration),
                user_id: targetUserId
            });

            await keyDoc.save();

            const dmEmbed = EmbedFactory.createNewKeyNotification(newKey, duration, userAvatar);

            try {
                const dmUser = await client.users.fetch(targetUserId);
                await dmUser.send({ embeds: [dmEmbed] });
            } catch (e) {
                console.error('Failed to send DM:', e.message);
            }

            await interaction.editReply({ 
                embeds: [EmbedFactory.createSuccess('Key Tạo Thành Công', `✅ Key đã được tạo và gửi qua DM.`, userAvatar)] 
            });
        }

        else if (commandName === 'gettoken') {
            const targetUser = interaction.options.getUser('user');
            const targetUserId = targetUser ? targetUser.id : userId;

            const isAdmin = await Admin.findOne({ user_id: userId });
            if (userId !== OWNER_ID && !isAdmin) {
                return interaction.editReply({ 
                    embeds: [EmbedFactory.createError('Quyền Hạn', '❌ Chỉ admin có thể tạo token!', userAvatar)] 
                });
            }

            const resetToken = crypto.randomBytes(16).toString('hex').toUpperCase();
            
            const tokenDoc = new Token({
                token_str: resetToken,
                created_by: userId,
                is_used: false
            });

            await tokenDoc.save();

            const dmEmbed = EmbedFactory.createResetTokenNotification(resetToken, userAvatar);

            // Respond immediately in channel
            await interaction.editReply({ 
                embeds: [EmbedFactory.createSuccess('Token Được Tạo', `✅ Token: ${resetToken}`, userAvatar)] 
            });

            // Send token to member via DM
            try {
                const dmUser = await client.users.fetch(targetUserId);
                await dmUser.send({ embeds: [dmEmbed] });
            } catch (e) {
                console.error('Failed to send token DM:', e.message);
            }
        }

    } catch (error) {
        console.error('❌ Command error:', error);
        await interaction.editReply({ 
            embeds: [EmbedFactory.createError('Lỗi Hệ Thống', '❌ Lỗi xử lý yêu cầu!', interaction.user.displayAvatarURL({ dynamic: true }))] 
        }).catch(() => {});
    }
});

console.log('🤖 Logging in Discord bot...');
client.login(TOKEN).catch(err => {
    console.error('❌ LOGIN ERROR:', err);
});
