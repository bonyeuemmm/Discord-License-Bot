const {
    Client,
    GatewayIntentBits,
    Events,
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

/* ============================================================
 *  CẤU HÌNH
 * ============================================================ */
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN || typeof TOKEN !== 'string' || TOKEN.trim() === '') {
    console.error('[FATAL] DISCORD_TOKEN không tồn tại hoặc không hợp lệ.');
    process.exit(1);
}

const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;
const OWNER_ID = '1208450889246048306';

const FOOTER_ICON_URL = 'https://i.postimg.cc/gJbhCmHL/Pain-Gamer.png';
const SECRET_KEY = "PainGamerSecretKey2156#VipTool";

const COOLDOWN_TIME = 5000;
const AUTOCOMPLETE_TIMEOUT_MS = 2500;

// Thông báo "Key đã hết hạn" gửi DM từ tác vụ nền (KHÔNG liên quan tới các lệnh slash).
// Đặt thành false nếu muốn tắt hoàn toàn mọi DM của bot.
const NOTIFY_EXPIRED_VIA_DM = true;

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

/* ============================================================
 *  TIỆN ÍCH GIAO DIỆN
 * ============================================================ */
const getFooterOptions = () => ({
    text: 'Bot By PAIN • Professional Key System',
    iconURL: FOOTER_ICON_URL
});

// Codeblock chỉ chứa DUY NHẤT giá trị cần copy, không kèm chữ thừa.
const codeBlock = (value) => '```\n' + value + '\n```';

const formatDuration = (days) => (Number(days) === 0 ? 'Vĩnh viễn' : `${days} ngày`);

function buildEmbed(color, icon, title, description, thumbnail = null) {
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${icon} ${title}`)
        .setDescription(description)
        .setFooter(getFooterOptions())
        .setTimestamp();

    if (thumbnail) embed.setThumbnail(thumbnail);
    return embed;
}

class EmbedFactory {
    static createSuccess(title, description, thumbnail = null) {
        return buildEmbed(COLORS.SUCCESS, '✅', title, description, thumbnail);
    }

    static createError(title, description, thumbnail = null) {
        return buildEmbed(COLORS.ERROR, '❌', title, description, thumbnail);
    }

    static createWarning(title, description, thumbnail = null) {
        return buildEmbed(COLORS.WARNING, '⚠️', title, description, thumbnail);
    }

    static createInfo(title, description, thumbnail = null) {
        return buildEmbed(COLORS.INFO, 'ℹ️', title, description, thumbnail);
    }

    static createPremium(title, description, thumbnail = null) {
        return buildEmbed(COLORS.GOLD, '💎', title, description, thumbnail);
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

    static createKeyExpiredNotification(assignedKey, durationText, userAvatar) {
        return new EmbedBuilder()
            .setColor(COLORS.WARNING)
            .setTitle('⏰ Key Đã Hết Hạn')
            .setDescription('Key của bạn đã hết hạn và bị xóa khỏi hệ thống.')
            .setThumbnail(userAvatar)
            .addFields(
                { name: '🔐 Mã Key', value: assignedKey, inline: false },
                { name: '⏱️ Thời Hạn Đã Dùng', value: durationText, inline: true }
            )
            .setFooter(getFooterOptions())
            .setTimestamp();
    }
}

/* ============================================================
 *  MONGODB
 * ============================================================ */
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
    // Không dùng unique+sparse: sparse vẫn index giá trị null nên key thứ 2 chưa kích hoạt sẽ lỗi E11000.
    // Tính duy nhất được đảm bảo bằng partial index trong ensureKeyIndexes().
    assigned_key: { type: String, default: null },
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

const isDbReady = () => mongoose.connection.readyState === 1;

// Xóa index cũ (unique+sparse) trên assigned_key nếu còn tồn tại trong DB,
// rồi tạo partial index: chỉ ràng buộc duy nhất với các key đã được cấp (kiểu string).
async function ensureKeyIndexes() {
    try {
        const indexes = await Key.collection.indexes();
        for (const idx of indexes) {
            const isAssignedKeyIndex = idx.key
                && Object.keys(idx.key).length === 1
                && idx.key.assigned_key === 1;

            if (isAssignedKeyIndex && !idx.partialFilterExpression) {
                await Key.collection.dropIndex(idx.name);
                console.log(`🔧 Đã xóa index cũ gây lỗi trùng key null: ${idx.name}`);
            }
        }
    } catch (e) {
        // code 26: collection chưa tồn tại -> bỏ qua
        if (e.code !== 26) console.error('❌ Lỗi khi kiểm tra index cũ của Key:', e);
    }

    try {
        await Key.collection.createIndex(
            { assigned_key: 1 },
            {
                name: 'assigned_key_1',
                unique: true,
                partialFilterExpression: { assigned_key: { $type: 'string' } }
            }
        );
        console.log('✅ Key indexes ready.');
    } catch (e) {
        console.error('❌ Lỗi khi tạo index cho Key:', e);
    }
}

if (!MONGODB_URI) {
    console.error('❌ Thiếu MONGODB_URI / MONGO_URI trong biến môi trường.');
} else {
    console.log('🔄 Connecting to MongoDB Atlas...');
    mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
        .then(async () => {
            console.log('✅ MongoDB connected successfully!');
            await ensureKeyIndexes();
        })
        .catch(err => console.error('❌ MongoDB error:', err));
}

/* ============================================================
 *  EXPRESS API
 * ============================================================ */
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send('Bot is active and running successfully!');
});

app.post(['/', '/api/verify'], async (req, res) => {
    const { key, hwid, timestamp, signature } = req.body || {};
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
    const { key, hwid, timestamp, signature, discord_id } = req.body || {};
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

// QUAN TRỌNG: phải lắng nghe cổng, nếu không các nền tảng hosting (Render/Railway/...)
// sẽ coi service lỗi và API /api/verify, /api/link-hwid cũng không hoạt động.
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Express server listening on port ${PORT}`);
});

/* ============================================================
 *  HÀM HỖ TRỢ KEY
 * ============================================================ */
let isCheckingExpired = false;

async function checkExpiredKeys(client) {
    if (isCheckingExpired || !isDbReady()) return;
    isCheckingExpired = true;

    try {
        const now = Date.now();

        const expiredKeys = await Key.find({
            assigned_key: { $ne: null },
            expires_at: { $gt: 0, $lt: now }
        });

        for (const keyDoc of expiredKeys) {
            try {
                if (NOTIFY_EXPIRED_VIA_DM && keyDoc.user_id) {
                    const user = await client.users.fetch(keyDoc.user_id).catch(() => null);

                    if (user) {
                        const expiredEmbed = EmbedFactory.createKeyExpiredNotification(
                            keyDoc.assigned_key,
                            formatDuration(keyDoc.duration_days || 0),
                            user.displayAvatarURL()
                        );
                        await user.send({ embeds: [expiredEmbed] }).catch(() => {});
                    }
                }

                await Key.deleteOne({ _id: keyDoc._id });
                console.log(`✅ Expired key deleted: ${keyDoc.assigned_key.substring(0, 8)}...`);
            } catch (e) {
                console.error('❌ Error while removing expired key:', e);
            }
        }
    } catch (e) {
        console.error("❌ Check Expired Keys Error:", e);
    } finally {
        isCheckingExpired = false;
    }
}

async function generateUniqueAssignedKey() {
    const make = () => `pain_key_${crypto.randomBytes(16).toString('hex').toUpperCase().substring(0, 20)}`;

    let newKey = make();
    while (await Key.findOne({ assigned_key: newKey })) {
        newKey = make();
    }

    return newKey;
}

/* ============================================================
 *  DISCORD CLIENT + SLASH COMMANDS
 * ============================================================ */
// Chỉ cần intent Guilds cho slash command / autocomplete / select menu.
// Bỏ MessageContent, GuildMembers (privileged intents): nếu chưa bật trong Developer Portal,
// bot sẽ bị lỗi "Used disallowed intents" và KHÔNG đăng nhập được -> mọi lệnh đều không phản hồi.
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const cooldowns = new Map();

const commands = [
    new SlashCommandBuilder().setName('setadmin').setDescription('Quản lý admin')
        .addStringOption(opt => opt.setName('action').setDescription('Thao tác').setRequired(true).addChoices({ name: 'Thêm Admin', value: 'add' }, { name: 'Xóa Admin', value: 'remove' }))
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)),
    new SlashCommandBuilder().setName('createkey').setDescription('Tạo key bản quyền')
        .addStringOption(opt => opt.setName('duration').setDescription('Thời hạn').setRequired(true).addChoices({ name: '1 Ngày', value: '1' }, { name: '3 Ngày', value: '3' }, { name: '7 Ngày', value: '7' }, { name: '30 Ngày', value: '30' }, { name: 'Vĩnh viễn', value: '0' }))
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên sở hữu key (mặc định là bạn)').setRequired(false)),
    new SlashCommandBuilder().setName('gettoken').setDescription('Tạo token reset HWID')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên sẽ dùng token (chỉ để ghi chú)').setRequired(false)),
    new SlashCommandBuilder().setName('getkey').setDescription('Lấy key và xem thống kê'),
    new SlashCommandBuilder().setName('removekey').setDescription('Xóa key (Chỉ Owner)')
        .addStringOption(opt => opt.setName('toolkey').setDescription('Tool key hoặc mã key gốc').setRequired(true)),
    new SlashCommandBuilder().setName('resethwid').setDescription('Reset HWID')
        .addStringOption(opt => opt.setName('key').setDescription('Chọn key của bạn').setRequired(true).setAutocomplete(true))
        .addStringOption(opt => opt.setName('token').setDescription('Token (Tùy chọn)').setRequired(false)),
    new SlashCommandBuilder().setName('activatekey').setDescription('Kích hoạt key')
        .addStringOption(opt => opt.setName('key').setDescription('Key cấp phép').setRequired(true).setAutocomplete(true))
];

async function registerCommands() {
    if (!CLIENT_ID || !GUILD_ID) {
        console.error('❌ Thiếu CLIENT_ID hoặc GUILD_ID, bỏ qua đăng ký slash commands.');
        return;
    }

    try {
        console.log('🔄 Registering slash commands...');
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands.map(c => c.toJSON()) }
        );
        console.log('✅ Slash commands registered.');
    } catch (error) {
        console.error('❌ Command registration error:', error);
    }
}

registerCommands();

client.once(Events.ClientReady, () => {
    console.log(`🤖 Bot logged in as ${client.user.tag}`);

    setInterval(() => {
        checkExpiredKeys(client);
    }, 60 * 1000);
});

client.on('error', err => console.error('❌ Discord client error:', err));

/* ============================================================
 *  AUTOCOMPLETE
 * ============================================================ */
function withTimeout(promise, ms, fallback) {
    let timer;
    const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve(fallback), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function buildAutocompleteChoices(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'key') return [];

    const keyword = String(focused.value || '').trim().toLowerCase();
    const userId = interaction.user.id;
    const now = Date.now();

    if (interaction.commandName === 'resethwid') {
        const docs = await Key.find({
            user_id: userId,
            assigned_key: { $ne: null },
            $or: [{ expires_at: 0 }, { expires_at: { $gt: now } }]
        }).limit(100).lean();

        return docs
            .filter(k => k.assigned_key && k.assigned_key.toLowerCase().includes(keyword))
            .slice(0, 25)
            .map(k => ({
                name: `${k.assigned_key} • ${k.hwid ? '🔒 Đã liên kết' : '🔓 Chưa liên kết'}`.substring(0, 100),
                value: k.assigned_key
            }));
    }

    if (interaction.commandName === 'activatekey') {
        const docs = await Key.find({
            user_id: userId,
            assigned_key: null,
            is_used: { $ne: 1 }
        }).limit(100).lean();

        return docs
            .filter(k => k.key && k.key.toLowerCase().includes(keyword))
            .slice(0, 25)
            .map(k => ({
                name: `${k.key} • ${formatDuration(k.duration_days)}`.substring(0, 100),
                value: k.key
            }));
    }

    return [];
}

async function handleAutocomplete(interaction) {
    let choices = [];

    try {
        if (isDbReady()) {
            choices = await withTimeout(buildAutocompleteChoices(interaction), AUTOCOMPLETE_TIMEOUT_MS, []);
        }
    } catch (error) {
        console.error('❌ Autocomplete error:', error);
        choices = [];
    }

    try {
        await interaction.respond(choices);
    } catch (error) {
        // 10062: interaction hết hạn | 40060: đã phản hồi rồi -> bỏ qua
        if (error.code !== 10062 && error.code !== 40060) {
            console.error('❌ Autocomplete respond error:', error);
            await interaction.respond([]).catch(() => {});
        }
    }
}

/* ============================================================
 *  XỬ LÝ CÁC LỆNH
 *  Mỗi handler luôn kết thúc bằng interaction.editReply()
 * ============================================================ */
async function requireAdmin(userId) {
    if (userId === OWNER_ID) return true;
    const isAdmin = await Admin.findOne({ user_id: userId });
    return !!isAdmin;
}

const commandHandlers = {
    async setadmin(interaction, { userId, userAvatar }) {
        if (userId !== OWNER_ID) {
            return interaction.editReply({
                embeds: [EmbedFactory.createError('Quyền Hạn', '❌ Chỉ Owner có quyền!', userAvatar)]
            });
        }

        const action = interaction.options.getString('action');
        const targetUserId = interaction.options.getUser('user').id;

        if (action === 'add') {
            const existingAdmin = await Admin.findOne({ user_id: targetUserId });
            if (existingAdmin) {
                return interaction.editReply({
                    embeds: [EmbedFactory.createError('Tồn Tại', '❌ User này đã là admin rồi!', userAvatar)]
                });
            }

            await new Admin({ user_id: targetUserId }).save();

            return interaction.editReply({
                embeds: [EmbedFactory.createSuccess('Thêm Admin', `✅ <@${targetUserId}> đã được thêm làm admin!`, userAvatar)]
            });
        }

        if (action === 'remove') {
            const result = await Admin.deleteOne({ user_id: targetUserId });
            if (result.deletedCount === 0) {
                return interaction.editReply({
                    embeds: [EmbedFactory.createError('Không Tìm Thấy', '❌ User này không phải admin!', userAvatar)]
                });
            }

            return interaction.editReply({
                embeds: [EmbedFactory.createSuccess('Xóa Admin', `✅ <@${targetUserId}> đã bị xóa khỏi admin!`, userAvatar)]
            });
        }

        return interaction.editReply({
            embeds: [EmbedFactory.createError('Thao Tác Không Hợp Lệ', '❌ Thao tác không được hỗ trợ!', userAvatar)]
        });
    },

    async removekey(interaction, { userId, userAvatar }) {
        if (userId !== OWNER_ID) {
            return interaction.editReply({
                embeds: [EmbedFactory.createError('Quyền Hạn', '❌ Chỉ Owner có quyền xóa key!', userAvatar)]
            });
        }

        const toolKey = interaction.options.getString('toolkey').trim();

        let result = await Key.deleteOne({ assigned_key: toolKey });
        if (result.deletedCount === 0) {
            result = await Key.deleteOne({ key: toolKey });
        }

        if (result.deletedCount === 0) {
            return interaction.editReply({
                embeds: [EmbedFactory.createError('Không Tìm Thấy', '❌ Key này không tồn tại!', userAvatar)]
            });
        }

        return interaction.editReply({
            embeds: [EmbedFactory.createSuccess('Xóa Key Thành Công', '✅ Key đã được xóa khỏi hệ thống!', userAvatar)]
        });
    },

    async activatekey(interaction, { userId, userAvatar }) {
        const inputKey = interaction.options.getString('key').trim();
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

        // Phản hồi DUY NHẤT 1 lần, key nằm riêng trong codeblock để copy.
        const embed = EmbedFactory.createSuccess(
            'Kích Hoạt Thành Công',
            `Mã Key của bạn:\n${codeBlock(assignedKey)}`,
            userAvatar
        ).addFields({ name: '⏱️ Thời Hạn', value: formatDuration(row.duration_days), inline: true });

        return interaction.editReply({ embeds: [embed] });
    },

    async resethwid(interaction, { userId, userAvatar }) {
        const inputKey = interaction.options.getString('key').trim();
        const tokenInput = (interaction.options.getString('token') || '').trim();
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

            return interaction.editReply({
                embeds: [EmbedFactory.createSuccess('Reset HWID Thành Công', '✅ Đã reset phần cứng thành công (Token đã được dùng)!', userAvatar)]
            });
        }

        if (row.last_reset && (now - row.last_reset < cooldown)) {
            const hoursLeft = Math.ceil((cooldown - (now - row.last_reset)) / 3600000);
            return interaction.editReply({
                embeds: [EmbedFactory.createWarning('Đang Chờ Cooldown', `Vui lòng đợi thêm **${hoursLeft} giờ** nữa để reset HWID hoặc dùng token cấp phép.`, userAvatar)]
            });
        }

        row.hwid = null;
        row.last_reset = now;
        await row.save();

        return interaction.editReply({
            embeds: [EmbedFactory.createSuccess('Reset HWID Thành Công', '✅ Đã reset phần cứng thành công!', userAvatar)]
        });
    },

    async getkey(interaction, { userId, userAvatar }) {
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

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_getkey_${userId}`)
            .setPlaceholder('Chọn key của bạn...')
            .addOptions(
                userKeys.slice(0, 25).map((k, idx) => ({
                    label: `Key #${idx + 1} • ${k.assigned_key.substring(0, 8)}...`,
                    description: k.hwid ? '✅ HWID Linked' : '❌ No HWID',
                    value: k.assigned_key
                }))
            );

        const responseMessage = await interaction.editReply({
            embeds: [publicEmbed],
            components: [new ActionRowBuilder().addComponents(selectMenu)]
        });

        const collector = responseMessage.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 5 * 60 * 1000
        });

        collector.on('collect', async i => {
            try {
                if (i.user.id !== userId) {
                    return await i.reply({
                        content: '❌ Bạn không thể thao tác menu của người khác!',
                        ephemeral: true
                    });
                }

                const selectedKeyStr = i.values[0];
                const row = await Key.findOne({ assigned_key: selectedKeyStr, user_id: userId });
                const currentNow = Date.now();

                if (!row || (row.expires_at !== 0 && currentNow > row.expires_at)) {
                    if (row) {
                        await Key.deleteOne({ _id: row._id });
                    }
                    return await i.reply({
                        content: '❌ Key đã hết hạn hoặc không tồn tại!',
                        ephemeral: true
                    });
                }

                const detailEmbed = EmbedFactory.createKeyDetail(row, i.user.displayAvatarURL(), currentNow);
                await i.reply({ embeds: [detailEmbed], ephemeral: true });
            } catch (e) {
                console.error('❌ getkey collector error:', e);
                if (!i.replied && !i.deferred) {
                    await i.reply({ content: '❌ Lỗi xử lý yêu cầu!', ephemeral: true }).catch(() => {});
                }
            }
        });

        collector.on('end', async () => {
            try {
                const disabledMenu = StringSelectMenuBuilder.from(selectMenu)
                    .setDisabled(true)
                    .setPlaceholder('❌ Menu hết hiệu lực');

                await interaction.editReply({ components: [new ActionRowBuilder().addComponents(disabledMenu)] });
            } catch (e) { /* interaction token có thể đã hết hạn */ }
        });
    },

    async createkey(interaction, { userId, userAvatar }) {
        if (!(await requireAdmin(userId))) {
            return interaction.editReply({
                embeds: [EmbedFactory.createError('Quyền Hạn', '❌ Chỉ admin có thể tạo key!', userAvatar)]
            });
        }

        const duration = interaction.options.getString('duration');
        const targetUser = interaction.options.getUser('user');
        const targetUserId = targetUser ? targetUser.id : userId;

        const newKey = crypto.randomBytes(16).toString('hex').toUpperCase();

        await new Key({
            key: newKey,
            assigned_key: null,
            expires_at: 0,
            duration_days: parseInt(duration, 10),
            user_id: targetUserId
        }).save();

        // Không gửi DM. Trả lời duy nhất 1 lần (ephemeral), key nằm riêng trong codeblock.
        const embed = EmbedFactory.createSuccess(
            'Key Tạo Thành Công',
            `Mã Key của bạn:\n${codeBlock(newKey)}`,
            userAvatar
        ).addFields(
            { name: '⏱️ Thời Hạn', value: formatDuration(duration), inline: true },
            { name: '👤 Dành Cho', value: `<@${targetUserId}>`, inline: true }
        );

        return interaction.editReply({ embeds: [embed] });
    },

    async gettoken(interaction, { userId, userAvatar }) {
        if (!(await requireAdmin(userId))) {
            return interaction.editReply({
                embeds: [EmbedFactory.createError('Quyền Hạn', '❌ Chỉ admin có thể tạo token!', userAvatar)]
            });
        }

        const targetUser = interaction.options.getUser('user');

        const resetToken = crypto.randomBytes(16).toString('hex').toUpperCase();

        await new Token({
            token_str: resetToken,
            created_by: userId,
            is_used: false
        }).save();

        // Không gửi DM. Trả lời duy nhất 1 lần (ephemeral), token nằm riêng trong codeblock.
        const embed = EmbedFactory.createSuccess(
            'Token Được Tạo',
            `Mã Token của bạn:\n${codeBlock(resetToken)}`,
            userAvatar
        ).addFields({ name: '⚠️ Lưu Ý', value: 'Token chỉ sử dụng được 1 lần.', inline: false });

        if (targetUser) {
            embed.addFields({ name: '👤 Dành Cho', value: `<@${targetUser.id}>`, inline: false });
        }

        return interaction.editReply({ embeds: [embed] });
    }
};

/* ============================================================
 *  INTERACTION CREATE
 * ============================================================ */
// Luôn cố gắng phản hồi người dùng: editReply nếu đã defer/reply, ngược lại dùng reply.
async function safeRespond(interaction, payload) {
    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(payload);
        }
        return await interaction.reply({ ...payload, ephemeral: true });
    } catch (e) {
        console.error('❌ Không thể phản hồi interaction:', e);
        return null;
    }
}

async function handleCommand(interaction) {
    const userId = interaction.user.id;

    if (cooldowns.has(userId)) {
        await interaction.reply({
            content: '⏱️ Bạn đang sử dụng lệnh quá nhanh, vui lòng đợi...',
            ephemeral: true
        }).catch(() => {});
        return;
    }

    cooldowns.set(userId, true);
    setTimeout(() => cooldowns.delete(userId), COOLDOWN_TIME);

    // Bước 1: defer. Nếu thất bại (interaction đã hết hạn) thì không thể phản hồi nữa.
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (error) {
        console.error('❌ deferReply failed:', error.message);
        return;
    }

    const ctx = {
        userId,
        userAvatar: interaction.user.displayAvatarURL()
    };

    // Bước 2: xử lý lệnh. MỌI nhánh đều phải kết thúc bằng editReply.
    try {
        if (!isDbReady()) {
            await interaction.editReply({
                embeds: [EmbedFactory.createError('Database Chưa Sẵn Sàng', '❌ Hệ thống đang kết nối cơ sở dữ liệu, vui lòng thử lại sau ít giây!', ctx.userAvatar)]
            });
            return;
        }

        const handler = commandHandlers[interaction.commandName];
        if (!handler) {
            await interaction.editReply({
                embeds: [EmbedFactory.createError('Lệnh Không Hợp Lệ', '❌ Lệnh này không được hỗ trợ!', ctx.userAvatar)]
            });
            return;
        }

        await handler(interaction, ctx);
    } catch (error) {
        const errorId = crypto.randomBytes(3).toString('hex').toUpperCase();
        console.error(`❌ [${errorId}] Chi tiết lỗi lệnh /${interaction.commandName}:`, error);

        // Mã lỗi hiển thị cho mọi người để đối chiếu với log; nội dung lỗi chỉ hiển thị cho Owner.
        let description = `❌ Lỗi xử lý yêu cầu!\nMã lỗi: \`${errorId}\``;
        if (userId === OWNER_ID) {
            const detail = String((error && (error.stack || error.message)) || error).substring(0, 700);
            description += `\n${codeBlock(detail)}`;
        }

        await safeRespond(interaction, {
            embeds: [EmbedFactory.createError('Lỗi Hệ Thống', description, ctx.userAvatar)]
        });
        return;
    }

    // Bước 3: lưới an toàn - nếu vì lý do nào đó handler chưa editReply thì phản hồi ngay.
    if (!interaction.replied) {
        await interaction.editReply({
            embeds: [EmbedFactory.createWarning('Không Có Phản Hồi', 'Lệnh đã được xử lý nhưng không có nội dung trả về.', ctx.userAvatar)]
        }).catch(() => {});
    }
}

client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction);
            return;
        }

        if (interaction.isChatInputCommand()) {
            await handleCommand(interaction);
        }
    } catch (error) {
        console.error('Chi tiết lỗi lệnh:', error);
    }
});

/* ============================================================
 *  CHỐNG CRASH
 * ============================================================ */
process.on('unhandledRejection', reason => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', error => {
    console.error('❌ Uncaught Exception:', error);
});

console.log('🤖 Logging in Discord bot...');
client.login(TOKEN).catch(err => {
    console.error('❌ LOGIN ERROR:', err);
});
