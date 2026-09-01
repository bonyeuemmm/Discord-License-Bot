const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const sqlite3 = require('./sqlite3-compat.cjs').verbose();
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const OWNER_ID = '1208450889246048306';
const THUMBNAIL_URL = 'https://i.postimg.cc/gJbhCmHL/Pain-Gamer.png'; 

const getRandomColor = () => Math.floor(Math.random() * 16777215);

const db = new sqlite3.Database('./database.sqlite');
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS keys (
        key TEXT PRIMARY KEY,
        assigned_key TEXT,
        user_id TEXT,
        is_used INTEGER DEFAULT 0,
        expires_at INTEGER,
        hwid TEXT,
        last_reset INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS admins (
        user_id TEXT PRIMARY KEY
    )`);
    db.run(`INSERT OR IGNORE INTO keys (key, assigned_key, is_used, expires_at) VALUES ('1234567890', 'pain_key_888888', 1, 0)`);
});

const app = express();
app.use(express.json());

app.post('/api/verify', (req, res) => {
    const { key, hwid } = req.body;
    db.get(`SELECT * FROM keys WHERE assigned_key = ?`, [key], (err, row) => {
        if (err || !row) return res.json({ valid: false });
        if (row.expires_at !== 0 && Date.now() > row.expires_at) return res.json({ valid: false, reason: "expired" });
        if (!row.hwid) {
            db.run(`UPDATE keys SET hwid = ? WHERE assigned_key = ?`, [hwid, key]);
            return res.json({ valid: true });
        }
        if (row.hwid !== hwid) return res.json({ valid: false, reason: "hwid_mismatch" });
        res.json({ valid: true });
    });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Server đang chạy trên cổng ${PORT}`);
});

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
    new SlashCommandBuilder()
        .setName('setadmin')
        .setDescription('Thêm hoặc xóa admin hệ thống')
        .addStringOption(opt => opt.setName('action').setDescription('Chọn thao tác').setRequired(true).addChoices(
            { name: 'Thêm Admin', value: 'add' },
            { name: 'Xóa Admin', value: 'remove' }
        ))
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên cần thao tác').setRequired(true)),
    new SlashCommandBuilder()
        .setName('createkey')
        .setDescription('Tạo key bản quyền')
        .addStringOption(opt => opt.setName('duration').setDescription('Thời hạn').setRequired(true).addChoices(
            {name: '1 Ngày', value: '1'}, 
            {name: '3 Ngày', value: '3'}, 
            {name: '7 Ngày', value: '7'}, 
            {name: '30 Ngày', value: '30'}, 
            {name: 'Vĩnh viễn', value: '0'}
        ))
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên nhận key qua DM (Tùy chọn)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('createkeyresethwid')
        .setDescription('Tạo token reset HWID')
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên nhận token qua DM (Tùy chọn)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('getkey')
        .setDescription('Thống kê danh sách key hệ thống'),
    new SlashCommandBuilder()
        .setName('removekey')
        .setDescription('Xóa key khỏi hệ thống (Chỉ Owner)')
        .addStringOption(opt => opt.setName('toolkey').setDescription('Nhập tool key (vd: pain_key_...)').setRequired(true)),
    new SlashCommandBuilder()
        .setName('resethwid')
        .setDescription('Reset HWID')
        .addStringOption(opt => opt.setName('key').setDescription('Tool Key').setRequired(true))
        .addStringOption(opt => opt.setName('token').setDescription('Token (Tùy chọn)').setRequired(false)),
    new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Kích hoạt key')
        .addStringOption(opt => opt.setName('key').setDescription('Nhập key 10 số').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    const applicationId = CLIENT_ID || client.user.id;
    await rest.put(Routes.applicationCommands(applicationId), { body: commands });
    console.log(`Đăng ký Slash Commands thành công! Đã đăng nhập với tên: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (error) {
        console.error('Không thể xác nhận interaction:', error);
        return;
    }
    interaction.reply = (options) => interaction.editReply(options);

    const userId = interaction.user.id;
    const { commandName } = interaction;

    if (userId !== OWNER_ID) {
        if (!cooldowns.has(userId)) {
            cooldowns.set(userId, new Map());
        }
        const timestamps = cooldowns.get(userId);
        const now = Date.now();
        if (timestamps.has(commandName)) {
            const expirationTime = timestamps.get(commandName) + COOLDOWN_TIME;
            if (now < expirationTime) {
                const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
                return interaction.reply({ content: `⏳ **Thao tác quá nhanh!** Vui lòng đợi **${timeLeft} giây** nữa để tiếp tục.`, ephemeral: true });
            }
        }
        timestamps.set(commandName, now);
        setTimeout(() => timestamps.delete(commandName), COOLDOWN_TIME);
    }

    if (commandName === 'setadmin') {
        if (userId !== OWNER_ID) return interaction.reply({ content: "❌ **Từ chối quyền truy cập!** Lệnh này chỉ dành cho Owner.", ephemeral: true });

        const action = interaction.options.getString('action');
        const target = interaction.options.getUser('user');

        if (action === 'add') {
            db.run(`INSERT OR IGNORE INTO admins (user_id) VALUES (?)`, [target.id], (err) => {
                if (err) return interaction.reply({ content: "❌ **Lỗi hệ thống:** Không thể thêm admin vào cơ sở dữ liệu!", ephemeral: true });
                const embed = new EmbedBuilder()
                    .setColor(getRandomColor())
                    .setTitle('🛡️ Thêm Quản Trị Viên Thành Công')
                    .setDescription(`✅ Đã thêm thành công **${target.tag}** vào danh sách **Admin hệ thống**.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            });
        } else if (action === 'remove') {
            db.run(`DELETE FROM admins WHERE user_id = ?`, [target.id], (err) => {
                if (err) return interaction.reply({ content: "❌ **Lỗi hệ thống:** Không thể xóa admin khỏi cơ sở dữ liệu!", ephemeral: true });
                const embed = new EmbedBuilder()
                    .setColor(getRandomColor())
                    .setTitle('🛡️ Xóa Quản Trị Viên Thành Công')
                    .setDescription(`✅ Đã xóa thành công **${target.tag}** khỏi danh sách **Admin hệ thống**.`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            });
        }
    } 
    else if (commandName === 'createkey') {
        db.get(`SELECT user_id FROM admins WHERE user_id = ?`, [userId], async (err, row) => {
            if (!row && userId !== OWNER_ID) return interaction.reply({ content: "❌ **Từ chối quyền truy cập!** Bạn không có quyền tạo key.", ephemeral: true });

            const duration = parseInt(interaction.options.getString('duration'));
            const targetUser = interaction.options.getUser('user');
            const key = Math.floor(1000000000 + Math.random() * 9000000000).toString();
            const expiresAt = duration === 0 ? 0 : Date.now() + (duration * 24 * 60 * 60 * 1000);

            db.run(`INSERT INTO keys (key, expires_at) VALUES (?, ?)`, [key, expiresAt], async (insertErr) => {
                if (insertErr) return interaction.reply({ content: "❌ **Lỗi hệ thống:** Không thể lưu vào cơ sở dữ liệu!", ephemeral: true });

                try {
                    const ownerUser = await client.users.fetch(OWNER_ID);
                    const durationText = duration === 0 ? 'Vĩnh viễn' : `${duration} Ngày`;
                    await ownerUser.send(`📢 **Thông báo khởi tạo key mới:**\n- **Người tạo:** <@${userId}>\n- **Thời hạn:** ${durationText}\n- **Key gốc:** \`${key}\``);
                } catch (e) {}

                if (targetUser) {
                    try {
                        await targetUser.send(`🎉 **Bạn vừa nhận được key bản quyền từ hệ thống!**\n- **Key của bạn:** \`${key}\`\n- **Hướng dẫn:** Sử dụng lệnh \`/redeem key:${key}\` trên máy chủ để kích hoạt.`);
                        const embed = new EmbedBuilder()
                            .setColor(getRandomColor())
                            .setTitle('🎟️ Tạo Key Bản Quyền Thành Công')
                            .setDescription(`✅ Đã tạo và tự động gửi key trực tiếp vào DM của **${targetUser.tag}**!`);
                        return interaction.reply({ embeds: [embed], ephemeral: true });
                    } catch (dmErr) {
                        const embed = new EmbedBuilder()
                            .setColor(getRandomColor())
                            .setTitle('🎟️ Tạo Key Bản Quyền Thành Công')
                            .setDescription(`⚠️ Không thể gửi DM cho thành viên.\n- **Key của bạn:** \`${key}\``);
                        return interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                } else {
                    const embed = new EmbedBuilder()
                        .setColor(getRandomColor())
                        .setTitle('🎟️ Tạo Key Bản Quyền Thành Công')
                        .setDescription(`✅ Đã tạo thành công key hệ thống:\n\`${key}\``);
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            });
        });
    }
    else if (commandName === 'removekey') {
        if (userId !== OWNER_ID) return interaction.reply({ content: "❌ **Từ chối quyền truy cập!** Lệnh này chỉ dành riêng cho Owner.", ephemeral: true });

        const toolKey = interaction.options.getString('toolkey');
        db.get(`SELECT * FROM keys WHERE assigned_key = ?`, [toolKey], async (err, row) => {
            if (err || !row) {
                return interaction.reply({ content: `❌ **Không tìm thấy!** Không tồn tại tool key \`${toolKey}\` trong hệ thống.`, ephemeral: true });
            }

            if (row.user_id) {
                try {
                    const memberUser = await client.users.fetch(row.user_id);
                    await memberUser.send(`❗ **Thông báo từ hệ thống:** Key của bạn (\`${toolKey}\`) đã bị xóa bởi owner.`);
                } catch (e) {}
            }

            db.run(`DELETE FROM keys WHERE assigned_key = ?`, [toolKey], (delErr) => {
                if (delErr) return interaction.reply({ content: "❌ **Lỗi:** Không thể xóa key khỏi cơ sở dữ liệu.", ephemeral: true });
                const embed = new EmbedBuilder()
                    .setColor(getRandomColor())
                    .setTitle('🗑️ Xóa Tool Key Thành Công')
                    .setDescription(`✅ Đã xóa vĩnh viễn tool key:\n\`${toolKey}\``);
                interaction.reply({ embeds: [embed], ephemeral: true });
            });
        });
    }
    else if (commandName === 'redeem') {
        const inputKey = interaction.options.getString('key');
        db.get(`SELECT * FROM keys WHERE key = ?`, [inputKey], async (err, row) => {
            if (err || !row) return interaction.reply({ content: "❌ **Thất bại:** Key không tồn tại hoặc không chính xác!", ephemeral: true });
            if (row.is_used === 1 || row.assigned_key !== null) return interaction.reply({ content: "❌ **Thất bại:** Key này đã được kích hoạt trước đó!", ephemeral: true });
            if (row.expires_at !== 0 && Date.now() > row.expires_at) {
                db.run(`DELETE FROM keys WHERE key = ?`, [row.key]);
                return interaction.reply({ content: "❌ **Thất bại:** Key này đã hết hạn sử dụng!", ephemeral: true });
            }

            const assignedKey = `pain_key_${Math.floor(100000 + Math.random() * 900000)}`;
            db.run(`UPDATE keys SET assigned_key = ?, user_id = ?, is_used = 1 WHERE key = ?`, [assignedKey, userId, row.key], async () => {

                try {
                    const ownerUser = await client.users.fetch(OWNER_ID);
                    await ownerUser.send(`📢 **Thông báo Redeem:** Thành viên <@${userId}> vừa kích hoạt thành công tool key: \`${assignedKey}\``);
                } catch (e) {}

                const embed = new EmbedBuilder()
                    .setColor(getRandomColor())
                    .setTitle('🎉 Kích Hoạt Key Thành Công')
                    .setDescription(`Dưới đây là key công cụ của bạn, hãy sao chép và sử dụng:\n\n\`${assignedKey}\``);
                interaction.reply({ embeds: [embed], ephemeral: true });
            });
        });
    }
    else if (commandName === 'resethwid') {
        const inputKey = interaction.options.getString('key');
        const tokenInput = interaction.options.getString('token');

        db.get(`SELECT * FROM keys WHERE assigned_key = ? AND user_id = ?`, [inputKey, userId], (err, row) => {
            if (!row) return interaction.reply({ content: "❌ **Thất bại:** Key không hợp lệ hoặc không thuộc quyền sở hữu của bạn!", ephemeral: true });

            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000; 

            if (!tokenInput && (now - row.last_reset < cooldown)) {
                const timeLeft = Math.ceil((cooldown - (now - row.last_reset)) / (1000 * 60 * 60));
                return interaction.reply({ content: `⏳ **Chờ thời gian cooldown:** Bạn cần đợi thêm **${timeLeft} giờ** nữa mới được reset HWID.`, ephemeral: true });
            }

            db.run(`UPDATE keys SET hwid = NULL, last_reset = ? WHERE assigned_key = ?`, [now, inputKey], () => {
                const embed = new EmbedBuilder()
                    .setColor(getRandomColor())
                    .setTitle('🔄 Reset HWID Thành Công')
                    .setDescription(`✅ Đã reset thành công phần cứng HWID cho key: \`${inputKey}\``);
                interaction.reply({ embeds: [embed], ephemeral: true });
            });
        });
    }
    else if (commandName === 'getkey') {
        db.all(`SELECT assigned_key, expires_at, is_used, last_reset FROM keys LIMIT 20`, [], (err, rows) => {
            if (err || rows.length === 0) return interaction.reply({ content: "📂 **Trống:** Hiện tại hệ thống không có dữ liệu key nào.", ephemeral: true });

            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;
            const embed = new EmbedBuilder()
                .setColor(getRandomColor())
                .setTitle('📊 Thống Kê Hệ Thống Key Bản Quyền')
                .setThumbnail(THUMBNAIL_URL)
                .setTimestamp();

            rows.forEach((r, index) => {
                let statusText = '';
                if (r.expires_at === 0) {
                    statusText = 'Vĩnh viễn';
                } else {
                    const diffMs = r.expires_at - now;
                    if (diffMs <= 0) {
                        statusText = 'Đã hết hạn';
                    } else {
                        const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
                        statusText = `Còn ${diffHours} giờ tới sẽ hết hạn`;
                    }
                }

                let resetStatus = '🟢 Đã sẵn sàng reset HWID';
                if (r.last_reset > 0) {
                    const timeSinceReset = now - r.last_reset;
                    if (timeSinceReset < cooldown) {
                        const hoursLeft = Math.ceil((cooldown - timeSinceReset) / (1000 * 60 * 60));
                        resetStatus = `⏳ Reset HWID trong vòng ${hoursLeft} giờ tới`;
                    }
                }

                const displayKey = r.assigned_key ? r.assigned_key : 'Chưa_redeem';

                embed.addFields({
                    name: `🔑 Key #${index + 1}`,
                    value: `\`${displayKey}\`\n• **HWID:** ${resetStatus}\n• **Hạn dùng:** ${statusText}`,
                    inline: false
                });
            });

            interaction.reply({ embeds: [embed], ephemeral: true });
        });
    }
    else if (commandName === 'createkeyresethwid') {
        db.get(`SELECT user_id FROM admins WHERE user_id = ?`, [userId], async (err, row) => {
            if (!row && userId !== OWNER_ID) return interaction.reply({ content: "❌ **Từ chối quyền truy cập!**", ephemeral: true });

            const targetUser = interaction.options.getUser('user');
            const token = `reset_${Math.floor(100000 + Math.random() * 900000)}`;

            if (targetUser) {
                try {
                    await targetUser.send(`🔑 **Mã Token Reset HWID của bạn:**\n\`${token}\``);
                    const embed = new EmbedBuilder()
                        .setColor(getRandomColor())
                        .setTitle('🎫 Tạo Token Reset HWID Thành Công')
                        .setDescription(`✅ Đã tạo và gửi token reset trực tiếp qua DM cho **${targetUser.tag}**!`);
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                } catch (dmErr) {
                    const embed = new EmbedBuilder()
                        .setColor(getRandomColor())
                        .setTitle('🎫 Tạo Token Reset HWID Thành Công')
                        .setDescription(`⚠️ Không thể gửi DM. Token của bạn:\n\`${token}\``);
                    return interaction.reply({ embeds: [embed], ephemeral: true });
                }
            } else {
                const embed = new EmbedBuilder()
                    .setColor(getRandomColor())
                    .setTitle('🎫 Tạo Token Reset HWID Thành Công')
                    .setDescription(`✅ Đã tạo thành công mã token:\n\`${token}\``);
                    return interaction.reply({ embeds: [embed], ephemeral: true });
            }
        });
    }
});

client.login(TOKEN).catch(err => {
    console.error('LỖI ĐĂNG NHẬP DISCORD:', err);
});
                                        
