const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const MONGODB_URI = process.env.MONGODB_URI;
const OWNER_ID = '1208450889246048306';
const THUMBNAIL_URL = 'https://i.postimg.cc/gJbhCmHL/Pain-Gamer.png'; 

const getRandomColor = () => Math.floor(Math.random() * 16777215);

// Khởi tạo MongoDB Schema
const adminSchema = new mongoose.Schema({ user_id: String });
const Admin = mongoose.model('Admin', adminSchema);

const keySchema = new mongoose.Schema({
    key: String,
    assigned_key: { type: String, default: null },
    hwid: { type: String, default: null },
    expires_at: { type: Number, default: 0 },
    user_id: { type: String, default: null },
    is_used: { type: Number, default: 0 },
    last_reset: { type: Number, default: 0 }
});
const Key = mongoose.model('Key', keySchema);

// Kết nối MongoDB
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Đã kết nối MongoDB Atlas'))
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

const app = express();
app.use(express.json());

app.post('/api/verify', async (req, res) => {
    const { key, hwid } = req.body;
    try {
        const row = await Key.findOne({ assigned_key: key });
        if (!row) return res.json({ valid: false });
        if (row.expires_at !== 0 && Date.now() > row.expires_at) return res.json({ valid: false, reason: "expired" });
        if (!row.hwid) {
            row.hwid = hwid;
            await row.save();
            return res.json({ valid: true });
        }
        if (row.hwid !== hwid) return res.json({ valid: false, reason: "hwid_mismatch" });
        res.json({ valid: true });
    } catch (e) { return res.json({ valid: false }); }
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
    new SlashCommandBuilder().setName('setadmin').setDescription('Thêm/xóa admin')
        .addStringOption(opt => opt.setName('action').setDescription('Thao tác').setRequired(true).addChoices({ name: 'Thêm Admin', value: 'add' }, { name: 'Xóa Admin', value: 'remove' }))
        .addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)),
    new SlashCommandBuilder().setName('createkey').setDescription('Tạo key bản quyền')
        .addStringOption(opt => opt.setName('duration').setDescription('Thời hạn').setRequired(true).addChoices({name: '1 Ngày', value: '1'}, {name: '3 Ngày', value: '3'}, {name: '7 Ngày', value: '7'}, {name: '30 Ngày', value: '30'}, {name: 'Vĩnh viễn', value: '0'}))
        .addUserOption(opt => opt.setName('user').setDescription('Nhận key qua DM').setRequired(false)),
    new SlashCommandBuilder().setName('createkeyresethwid').setDescription('Tạo token reset HWID')
        .addUserOption(opt => opt.setName('user').setDescription('Nhận token qua DM').setRequired(false)),
    new SlashCommandBuilder().setName('getkey').setDescription('Thống kê key'),
    new SlashCommandBuilder().setName('removekey').setDescription('Xóa key (Chỉ Owner)')
        .addStringOption(opt => opt.setName('toolkey').setDescription('Tool key').setRequired(true)),
    new SlashCommandBuilder().setName('resethwid').setDescription('Reset HWID')
        .addStringOption(opt => opt.setName('key').setDescription('Tool Key').setRequired(true))
        .addStringOption(opt => opt.setName('token').setDescription('Token (Tùy chọn)').setRequired(false)),
    new SlashCommandBuilder().setName('redeem').setDescription('Kích hoạt key')
        .addStringOption(opt => opt.setName('key').setDescription('Nhập key 10 số').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
    await rest.put(Routes.applicationCommands(CLIENT_ID || client.user.id), { body: commands });
    console.log(`✅ Bot Discord đã sẵn sàng: ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const { commandName } = interaction;

    if (userId !== OWNER_ID) {
        if (!cooldowns.has(userId)) cooldowns.set(userId, new Map());
        const timestamps = cooldowns.get(userId);
        const now = Date.now();
        if (timestamps.has(commandName) && now < timestamps.get(commandName) + COOLDOWN_TIME) {
            return interaction.editReply({ content: `⏳ **Thao tác quá nhanh!** Vui lòng đợi ${( (timestamps.get(commandName) + COOLDOWN_TIME - now) / 1000 ).toFixed(1)}s.` });
        }
        timestamps.set(commandName, now);
        setTimeout(() => timestamps.delete(commandName), COOLDOWN_TIME);
    }

    try {
        if (commandName === 'setadmin') {
            if (userId !== OWNER_ID) return interaction.editReply({ content: "❌ **Từ chối!** Chỉ Owner." });
            const action = interaction.options.getString('action');
            const target = interaction.options.getUser('user');

            if (action === 'add') {
                await Admin.findOneAndUpdate({ user_id: target.id }, { user_id: target.id }, { upsert: true });
                interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🛡️ Đã Thêm Admin').setDescription(`✅ Đã thêm **${target.tag}**.`)] });
            } else {
                await Admin.deleteOne({ user_id: target.id });
                interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🛡️ Đã Xóa Admin').setDescription(`✅ Đã xóa **${target.tag}**.`)] });
            }
        } 
        else if (commandName === 'createkey') {
            const isAdmin = await Admin.findOne({ user_id: userId });
            if (!isAdmin && userId !== OWNER_ID) return interaction.editReply({ content: "❌ **Từ chối!** Bạn không có quyền." });

            const duration = parseInt(interaction.options.getString('duration'));
            const targetUser = interaction.options.getUser('user');
            const keyStr = Math.floor(1000000000 + Math.random() * 9000000000).toString();
            const expiresAt = duration === 0 ? 0 : Date.now() + (duration * 24 * 60 * 60 * 1000);

            await new Key({ key: keyStr, expires_at: expiresAt }).save();
            
            try { await (await client.users.fetch(OWNER_ID)).send(`📢 **Key mới:** Tạo bởi <@${userId}> | Hạn: ${duration} ngày | \`${keyStr}\``); } catch (e) {}

            if (targetUser) {
                try {
                    await targetUser.send(`🎉 **Key bản quyền:** \`${keyStr}\`\nSử dụng lệnh \`/redeem key:${keyStr}\``);
                    interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🎟️ Đã Tạo').setDescription(`✅ Đã gửi cho **${targetUser.tag}**.`)] });
                } catch (e) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🎟️ Đã Tạo').setDescription(`⚠️ Không thể DM. Key: \`${keyStr}\``)] });
                }
            } else {
                interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🎟️ Đã Tạo').setDescription(`✅ Key:\n\`${keyStr}\``)] });
            }
        }
        else if (commandName === 'removekey') {
            if (userId !== OWNER_ID) return interaction.editReply({ content: "❌ **Từ chối!** Chỉ Owner." });
            const toolKey = interaction.options.getString('toolkey');
            const row = await Key.findOneAndDelete({ assigned_key: toolKey });
            
            if (!row) return interaction.editReply({ content: `❌ Không tìm thấy key \`${toolKey}\`.` });
            interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🗑️ Đã Xóa').setDescription(`✅ Đã xóa vĩnh viễn:\n\`${toolKey}\``)] });
        }
        else if (commandName === 'redeem') {
            const inputKey = interaction.options.getString('key');
            const row = await Key.findOne({ key: inputKey });
            
            if (!row) return interaction.editReply({ content: "❌ Key không tồn tại!" });
            if (row.is_used === 1 || row.assigned_key) return interaction.editReply({ content: "❌ Key đã được kích hoạt!" });
            if (row.expires_at !== 0 && Date.now() > row.expires_at) {
                await Key.deleteOne({ key: inputKey });
                return interaction.editReply({ content: "❌ Key đã hết hạn!" });
            }

            const assignedKey = `pain_key_${Math.floor(100000 + Math.random() * 900000)}`;
            row.assigned_key = assignedKey;
            row.user_id = userId;
            row.is_used = 1;
            await row.save();

            interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🎉 Kích Hoạt Thành Công').setDescription(`Key tool của bạn:\n\`${assignedKey}\``)] });
        }
        else if (commandName === 'resethwid') {
            const inputKey = interaction.options.getString('key');
            const row = await Key.findOne({ assigned_key: inputKey, user_id: userId });
            
            if (!row) return interaction.editReply({ content: "❌ Key không hợp lệ hoặc không thuộc về bạn!" });

            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;
            if (!interaction.options.getString('token') && (now - row.last_reset < cooldown)) {
                return interaction.editReply({ content: `⏳ **Chờ:** Còn ${Math.ceil((cooldown - (now - row.last_reset)) / 3600000)} giờ để reset HWID.` });
            }

            row.hwid = null;
            row.last_reset = now;
            await row.save();
            interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🔄 Reset HWID').setDescription(`✅ Đã reset phần cứng cho key: \`${inputKey}\``)] });
        }
        else if (commandName === 'getkey') {
            const rows = await Key.find().limit(20);
            if (!rows.length) return interaction.editReply({ content: "📂 Trống: Hệ thống không có key nào." });

            const embed = new EmbedBuilder().setColor(getRandomColor()).setTitle('📊 Thống Kê Key').setThumbnail(THUMBNAIL_URL);
            rows.forEach((r, i) => {
                let status = r.expires_at === 0 ? 'Vĩnh viễn' : (r.expires_at > Date.now() ? `Còn ${Math.ceil((r.expires_at - Date.now())/3600000)} giờ` : 'Đã hết hạn');
                embed.addFields({ name: `🔑 Key #${i + 1}`, value: `\`${r.assigned_key || 'Chưa_redeem'}\`\n• Hạn: ${status}` });
            });
            interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        console.error(error);
        interaction.editReply({ content: "❌ Đã xảy ra lỗi khi xử lý lệnh!" });
    }
});

client.login(TOKEN).catch(console.error);
