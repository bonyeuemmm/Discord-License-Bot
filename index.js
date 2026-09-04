const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN || typeof TOKEN !== 'string' || TOKEN.trim() === '') {
    console.error('[FATAL] DISCORD_TOKEN không tồn tại hoặc không hợp lệ.');
    process.exit(1);
}

const CLIENT_ID = process.env.CLIENT_ID;
const MONGODB_URI = process.env.MONGODB_URI;
const OWNER_ID = '1208450889246048306';
const THUMBNAIL_URL = 'https://i.postimg.cc/gJbhCmHL/Pain-Gamer.png'; 

const getRandomColor = () => Math.floor(Math.random() * 16777215);

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

console.log('🔄 Đang tiến hành kết nối đến MongoDB Atlas...');
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Đã kết nối MongoDB Atlas thành công!'))
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).send('Bot is active and running successfully!');
});

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
    console.log(`🌐 API Server đang chạy trên cổng ${PORT}`);
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
    new SlashCommandBuilder().setName('gettoken').setDescription('Tạo token reset HWID')
        .addUserOption(opt => opt.setName('user').setDescription('Nhận token qua DM').setRequired(false)),
    new SlashCommandBuilder().setName('getkey').setDescription('Thống kê key'),
    new SlashCommandBuilder().setName('removekey').setDescription('Xóa key (Chỉ Owner)')
        .addStringOption(opt => opt.setName('toolkey').setDescription('Tool key').setRequired(true)),
    new SlashCommandBuilder().setName('resethwid').setDescription('Reset HWID')
        .addStringOption(opt => opt.setName('key').setDescription('Chọn key của bạn').setRequired(true).setAutocomplete(true))
        .addStringOption(opt => opt.setName('token').setDescription('Token (Tùy chọn)').setRequired(false)),
    new SlashCommandBuilder().setName('redeem').setDescription('Kích hoạt key')
        .addStringOption(opt => opt.setName('key').setDescription('Nhập key 10 số').setRequired(true))
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function checkExpiredKeys() {
    try {
        const now = Date.now();
        const expiredKeys = await Key.find({ expires_at: { $ne: 0, $lt: now } });
        
        for (const row of expiredKeys) {
            if (row.user_id) {
                try {
                    const user = await client.users.fetch(row.user_id);
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('⌛ Thông Báo Hết Hạn Key')
                        .setDescription('Key bản quyền của bạn đã chính thức **hết hạn** và bị xóa khỏi hệ thống của bot. Vui lòng nhập key mới để tiếp tục sử dụng dịch vụ.')
                        .setThumbnail(THUMBNAIL_URL)
                        .setTimestamp();
                    await user.send({ embeds: [embed] });
                } catch (e) {}
            }
            await Key.deleteOne({ _id: row._id });
        }
    } catch (err) {
        console.error('❌ Lỗi khi quét key hết hạn:', err);
    }
}

client.once('clientReady', async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID || client.user.id), { body: commands });
        console.log(`✅ Đăng ký Slash Commands thành công! Bot Discord đã sẵn sàng: ${client.user.tag}`);
        
        setInterval(checkExpiredKeys, 60 * 60 * 1000);
    } catch (error) {
        console.error('❌ Lỗi đăng ký Slash Commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'resethwid') {
            try {
                const userId = interaction.user.id;
                const userKeys = await Key.find({ user_id: userId, assigned_key: { $ne: null } }).limit(25);
                
                const choices = userKeys.map(k => ({
                    name: `${k.assigned_key} ${k.hwid ? '(Đã khóa HWID)' : '(Chưa có HWID)'}`,
                    value: k.assigned_key
                }));

                await interaction.respond(choices);
            } catch (err) {
                console.error('❌ Lỗi Autocomplete resethwid:', err);
                await interaction.respond([]);
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.user.id;
    const { commandName } = interaction;

    if (userId !== OWNER_ID) {
        if (!cooldowns.has(userId)) cooldowns.set(userId, new Map());
        const timestamps = cooldowns.get(userId);
        const now = Date.now();
        if (timestamps.has(commandName) && now < timestamps.get(commandName) + COOLDOWN_TIME) {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('⏳ Thao Tác Quá Nhanh')
                .setDescription(`Vui lòng đợi **${((timestamps.get(commandName) + COOLDOWN_TIME - now) / 1000).toFixed(1)}s** trước khi tiếp tục.`)
                .setThumbnail(THUMBNAIL_URL);
            return interaction.editReply({ embeds: [embed] });
        }
        timestamps.set(commandName, now);
        setTimeout(() => timestamps.delete(commandName), COOLDOWN_TIME);
    }

    try {
        if (commandName === 'setadmin') {
            if (userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Từ Chối Truy Cập').setDescription('Chỉ Owner mới có quyền thực hiện lệnh này!').setThumbnail(THUMBNAIL_URL)] });
            }
            const action = interaction.options.getString('action');
            const target = interaction.options.getUser('user');

            if (action === 'add') {
                await Admin.findOneAndUpdate({ user_id: target.id }, { user_id: target.id }, { upsert: true });
                const embed = new EmbedBuilder().setColor(getRandomColor()).setTitle('🛡️ Đã Thêm Admin').setDescription(`✅ Đã thêm thành công **${target.tag}** vào danh sách quản trị viên.`).setThumbnail(THUMBNAIL_URL);
                interaction.editReply({ embeds: [embed] });
            } else {
                await Admin.deleteOne({ user_id: target.id });
                const embed = new EmbedBuilder().setColor(getRandomColor()).setTitle('🛡️ Đã Xóa Admin').setDescription(`✅ Đã xóa **${target.tag}** khỏi danh sách quản trị viên.`).setThumbnail(THUMBNAIL_URL);
                interaction.editReply({ embeds: [embed] });
            }
        } 
        else if (commandName === 'createkey') {
            const isAdmin = await Admin.findOne({ user_id: userId });
            if (!isAdmin && userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Từ Chối Truy Cập').setDescription('Bạn không có quyền sử dụng lệnh này!').setThumbnail(THUMBNAIL_URL)] });
            }

            const duration = parseInt(interaction.options.getString('duration'));
            const targetUser = interaction.options.getUser('user');
            const keyStr = Math.floor(1000000000 + Math.random() * 9000000000).toString();
            const expiresAt = duration === 0 ? 0 : Date.now() + (duration * 24 * 60 * 60 * 1000);

            await new Key({ key: keyStr, expires_at: expiresAt }).save();
            
            try { 
                const ownerEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('📢 Thông Báo Tạo Key Mới')
                    .setDescription(`• **Người tạo:** <@${userId}>\n• **Thời hạn:** ${duration === 0 ? 'Vĩnh viễn' : duration + ' ngày'}\n• **Key:** \`${keyStr}\``)
                    .setThumbnail(THUMBNAIL_URL);
                await (await client.users.fetch(OWNER_ID)).send({ embeds: [ownerEmbed] }); 
            } catch (e) {}

            if (targetUser) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('🎉 Nhận Key Bản Quyền')
                        .setDescription(`Bạn vừa nhận được một key kích hoạt từ quản trị viên.\n\n• **Key:** \`${keyStr}\`\n• **Thời hạn:** ${duration === 0 ? 'Vĩnh viễn' : duration + ' ngày'}\n\nHãy dùng lệnh \`/redeem key:${keyStr}\` trong server để kích hoạt!`)
                        .setThumbnail(THUMBNAIL_URL);
                    await targetUser.send({ embeds: [dmEmbed] });

                    const replyEmbed = new EmbedBuilder().setColor(getRandomColor()).setTitle('🎟️ Đã Tạo Key Thành Công').setDescription(`✅ Đã tạo và gửi key trực tiếp qua DM cho **${targetUser.tag}**.\n• **Key:** \`${keyStr}\``).setThumbnail(THUMBNAIL_URL);
                    interaction.editReply({ embeds: [replyEmbed] });
                } catch (e) {
                    const replyEmbed = new EmbedBuilder().setColor(0xFFA500).setTitle('🎟️ Đã Tạo Key').setDescription(`⚠️ Không thể gửi DM cho **${targetUser.tag}**.\n• **Key:** \`${keyStr}\``).setThumbnail(THUMBNAIL_URL);
                    interaction.editReply({ embeds: [replyEmbed] });
                }
            } else {
                const replyEmbed = new EmbedBuilder().setColor(getRandomColor()).setTitle('🎟️ Đã Tạo Key Thành Công').setDescription(`✅ Khởi tạo key thành công:\n\`${keyStr}\``).setThumbnail(THUMBNAIL_URL);
                interaction.editReply({ embeds: [replyEmbed] });
            }
        }
        else if (commandName === 'gettoken') {
            const isAdmin = await Admin.findOne({ user_id: userId });
            if (!isAdmin && userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Từ Chối').setDescription('Bạn không có quyền thực hiện lệnh này!').setThumbnail(THUMBNAIL_URL)] });
            }
            const targetUser = interaction.options.getUser('user');
            const tokenStr = `token_${Math.floor(100000 + Math.random() * 900000)}`;

            if (targetUser) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0x00FFFF)
                        .setTitle('🔑 Token Reset HWID Của Bạn')
                        .setDescription(`Token dùng để reset phần cứng:\n\`${tokenStr}\``)
                        .setThumbnail(THUMBNAIL_URL);
                    await targetUser.send({ embeds: [dmEmbed] });
                    
                    interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('✅ Thành Công').setDescription(`Đã gửi token reset HWID tới **${targetUser.tag}** qua DM.\n• Token: \`${tokenStr}\``).setThumbnail(THUMBNAIL_URL)] });
                } catch (e) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('⚠️ Cảnh Báo').setDescription(`Không thể gửi DM cho user này. Token:\n\`${tokenStr}\``).setThumbnail(THUMBNAIL_URL)] });
                }
            } else {
                interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🔑 Token Reset HWID').setDescription(`Token của bạn:\n\`${tokenStr}\``).setThumbnail(THUMBNAIL_URL)] });
            }
        }
        else if (commandName === 'removekey') {
            if (userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Từ Chối').setDescription('Chỉ Owner mới có quyền xóa key!').setThumbnail(THUMBNAIL_URL)] });
            }
            const toolKey = interaction.options.getString('toolkey');
            const row = await Key.findOneAndDelete({ assigned_key: toolKey });
            
            if (!row) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Lỗi').setDescription(`Không tìm thấy key tool với mã: \`${toolKey}\``).setThumbnail(THUMBNAIL_URL)] });
            }
            interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🗑️ Đã Xóa Key').setDescription(`✅ Đã xóa vĩnh viễn key tool:\n\`${toolKey}\``).setThumbnail(THUMBNAIL_URL)] });
        }
        else if (commandName === 'redeem') {
            const inputKey = interaction.options.getString('key');
            const row = await Key.findOne({ key: inputKey });
            
            if (!row) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Thất Bại').setDescription('Mã key không tồn tại trong hệ thống!').setThumbnail(THUMBNAIL_URL)] });
            if (row.is_used === 1 || row.assigned_key) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('⚠️ Thất Bại').setDescription('Mã key này đã được kích hoạt trước đó!').setThumbnail(THUMBNAIL_URL)] });
            if (row.expires_at !== 0 && Date.now() > row.expires_at) {
                await Key.deleteOne({ key: inputKey });
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Thất Bại').setDescription('Mã key này đã hết hạn sử dụng!').setThumbnail(THUMBNAIL_URL)] });
            }

            const assignedKey = `pain_key_${Math.floor(100000 + Math.random() * 900000)}`;
            row.assigned_key = assignedKey;
            row.user_id = userId;
            row.is_used = 1;
            await row.save();

            interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🎉 Kích Hoạt Thành Công').setDescription(`Kích hoạt thành công!\n• Key tool của bạn: \`${assignedKey}\``).setThumbnail(THUMBNAIL_URL)] });
        }
        else if (commandName === 'resethwid') {
            const inputKey = interaction.options.getString('key');
            const row = await Key.findOne({ assigned_key: inputKey, user_id: userId });
            
            if (!row) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Thất Bại').setDescription('Key không hợp lệ hoặc không thuộc sở hữu của bạn!').setThumbnail(THUMBNAIL_URL)] });

            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;
            if (!interaction.options.getString('token') && (now - row.last_reset < cooldown)) {
                const hoursLeft = Math.ceil((cooldown - (now - row.last_reset)) / 3600000);
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('⏳ Đang Chờ Cooldown').setDescription(`Vui lòng đợi thêm **${hoursLeft} giờ** nữa để reset HWID hoặc dùng token cấp phép.`).setThumbnail(THUMBNAIL_URL)] });
            }

            row.hwid = null;
            row.last_reset = now;
            await row.save();
            interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🔄 Reset HWID Thành Công').setDescription(`✅ Đã reset phần cứng thành công cho key: \`${inputKey}\``).setThumbnail(THUMBNAIL_URL)] });
        }
        else if (commandName === 'getkey') {
            const rows = await Key.find().limit(20);
            if (!rows.length) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('📂 Thống Kê Key').setDescription('Hiện tại hệ thống không có dữ liệu key nào.').setThumbnail(THUMBNAIL_URL)] });

            const embed = new EmbedBuilder().setColor(getRandomColor()).setTitle('📊 Thống Kê Key Hệ Thống').setThumbnail(THUMBNAIL_URL);
            const now = Date.now();
            const cooldown = 24 * 60 * 60 * 1000;

            rows.forEach((r, i) => {
                let status = r.expires_at === 0 ? 'Vĩnh viễn' : (r.expires_at > now ? `Còn ${Math.ceil((r.expires_at - now)/3600000)} giờ` : 'Đã hết hạn');
                
                let resetStatus = 'Có thể reset ngay';
                if (r.last_reset && (now - r.last_reset < cooldown)) {
                    let hoursLeft = Math.ceil((cooldown - (now - r.last_reset)) / 3600000);
                    resetStatus = `Cooldown (${hoursLeft}h)`;
                }

                embed.addFields({ 
                    name: `🔑 Key #${i + 1}`, 
                    value: `• Tool Key: \`${r.assigned_key || 'Chưa redeem'}\`\n• Hạn: ${status}\n• Reset HWID: ${resetStatus}` 
                });
            });
            interaction.editReply({ embeds: [embed] });
        }
    } catch (error) {
        console.error('❌ Lỗi xử lý lệnh:', error);
        interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Lỗi Hệ Thống').setDescription('Đã xảy ra lỗi không mong muốn khi xử lý yêu cầu!').setThumbnail(THUMBNAIL_URL)] });
    }
});

console.log('🤖 Đang tiến hành đăng nhập bot Discord...');
client.login(TOKEN).catch(err => {
    console.error('❌ LỖI ĐĂNG NHẬP DISCORD:', err);
});
