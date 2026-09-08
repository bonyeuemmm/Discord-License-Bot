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

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN || typeof TOKEN !== 'string' || TOKEN.trim() === '') {
    console.error('[FATAL] DISCORD_TOKEN không tồn tại hoặc không hợp lệ.');
    process.exit(1);
}

const CLIENT_ID = process.env.CLIENT_ID;
const MONGODB_URI = process.env.MONGODB_URI;
const OWNER_ID = '1208450889246048306';

const getRandomColor = () => Math.floor(Math.random() * 16777215);

const adminSchema = new mongoose.Schema({ user_id: String });
const Admin = mongoose.model('Admin', adminSchema);

const keySchema = new mongoose.Schema({
    key: String,
    assigned_key: { type: String, default: null },
    hwid: { type: String, default: null },
    expires_at: { type: Number, default: 0 },
    duration_days: { type: Number, default: 0 }, // Lưu số ngày gốc của key
    user_id: { type: String, default: null },
    is_used: { type: Number, default: 0 },
    last_reset: { type: Number, default: 0 },
    notified_24h: { type: Boolean, default: false },
    notified_4h: { type: Boolean, default: false }
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

app.post(['/', '/api/verify'], async (req, res) => {
    const { key, hwid } = req.body;
    try {
        const row = await Key.findOne({ assigned_key: key });
        if (!row) return res.json({ valid: false, reason: "key_not_found" });
        if (row.expires_at !== 0 && Date.now() > row.expires_at) return res.json({ valid: false, reason: "expired" });
        
        if (!row.hwid) {
            row.hwid = hwid;
            await row.save();
            return res.json({ valid: true, message: "hwid_bound_successfully" });
        }
        
        if (row.hwid !== hwid) {
            return res.json({ valid: false, reason: "hwid_mismatch" });
        }

        res.json({ valid: true });
    } catch (e) { 
        res.json({ valid: false, reason: "server_error" }); 
    }
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
    new SlashCommandBuilder().setName('getkey').setDescription('Lấy key và xem thống kê trạng thái key của bạn'),
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
        
        // 1. Quét và xóa các key đã hết hạn
        const expiredKeys = await Key.find({ expires_at: { $ne: 0, $lt: now } });
        for (const row of expiredKeys) {
            if (row.user_id) {
                try {
                    const user = await client.users.fetch(row.user_id);
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle('⌛ Thông Báo Hết Hạn Key')
                        .setDescription('Key bản quyền của bạn đã chính thức **hết hạn** và bị xóa khỏi hệ thống của bot. Vui lòng nhập key mới để tiếp tục sử dụng dịch vụ.')
                        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp();
                    await user.send({ embeds: [embed] });
                } catch (e) {}
            }
            await Key.deleteOne({ _id: row._id });
        }

        // 2. Quét các key sắp hết hạn để thông báo
        const activeKeys = await Key.find({ 
            expires_at: { $gt: now }, 
            user_id: { $ne: null } 
        });

        for (const row of activeKeys) {
            const timeLeftMs = row.expires_at - now;
            const hoursLeft = timeLeftMs / (1000 * 60 * 60);

            // Cảnh báo 24h đối với loại key 7 ngày trở lên
            if (row.duration_days >= 7 && hoursLeft <= 24 && !row.notified_24h) {
                try {
                    const user = await client.users.fetch(row.user_id);
                    const embed = new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle('⚠️ Cảnh Báo Hết Hạn Key (24h)')
                        .setDescription(`Thông báo key của bạn sắp hết hạn thời gian còn lại là 24 giờ!`)
                        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp();
                    await user.send({ embeds: [embed] });
                    row.notified_24h = true;
                    await row.save();
                } catch (e) {}
            }

            // Cảnh báo 4h (sau 20h) đối với loại key 1 ngày trở lên
            if (row.duration_days >= 1 && hoursLeft <= 4 && !row.notified_4h) {
                try {
                    const user = await client.users.fetch(row.user_id);
                    const embed = new EmbedBuilder()
                        .setColor(0xFF4500)
                        .setTitle('⚠️ Cảnh Báo Hết Hạn Key (4h)')
                        .setDescription(`20 giờ đã trôi qua key của bạn còn 4 giờ vui lòng nhập một key mới để tiếp tục sử dụng dịch vụ!`)
                        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp();
                    await user.send({ embeds: [embed] });
                    row.notified_4h = true;
                    await row.save();
                } catch (e) {}
            }
        }
    } catch (err) {
        console.error('❌ Lỗi khi quét key hết hạn:', err);
    }
}

client.once('clientReady', async () => {
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID || client.user.id), { body: commands });
        console.log(`✅ Đăng ký Slash Commands thành công! Bot Discord đã sẵn sàng: ${client.user.tag}`);
        
        // Chạy kiểm tra định kỳ mỗi 5 phút
        setInterval(checkExpiredKeys, 5 * 60 * 1000);
    } catch (error) {
        console.error('❌ Lỗi đăng ký Slash Commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'resethwid') {
            try {
                const userId = interaction.user.id;
                const now = Date.now();
                const userKeys = await Key.find({ 
                    user_id: userId, 
                    assigned_key: { $ne: null },
                    $or: [{ expires_at: 0 }, { expires_at: { $gt: now } }]
                }).limit(25);
                
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

    const userId = interaction.user.id;
    const userAvatar = interaction.user.displayAvatarURL({ dynamic: true });
    const { commandName } = interaction;

    const isPublicCommand = (commandName === 'getkey' || commandName === 'redeem');
    await interaction.deferReply({ ephemeral: !isPublicCommand });

    if (userId !== OWNER_ID) {
        if (!cooldowns.has(userId)) cooldowns.set(userId, new Map());
        const timestamps = cooldowns.get(userId);
        const now = Date.now();
        if (timestamps.has(commandName) && now < timestamps.get(commandName) + COOLDOWN_TIME) {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('⏳ Thao Tác Quá Nhanh')
                .setDescription(`Vui lòng đợi **${((timestamps.get(commandName) + COOLDOWN_TIME - now) / 1000).toFixed(1)}s** trước khi tiếp tục.`)
                .setThumbnail(userAvatar);
            return interaction.editReply({ embeds: [embed] });
        }
        timestamps.set(commandName, now);
        setTimeout(() => timestamps.delete(commandName), COOLDOWN_TIME);
    }

    try {
        if (commandName === 'setadmin') {
            if (userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Từ Chối Truy Cập').setDescription('Chỉ Owner mới có quyền thực hiện lệnh này!').setThumbnail(userAvatar)] });
            }
            const action = interaction.options.getString('action');
            const target = interaction.options.getUser('user');

            if (action === 'add') {
                await Admin.findOneAndUpdate({ user_id: target.id }, { user_id: target.id }, { upsert: true });
                const embed = new EmbedBuilder().setColor(getRandomColor()).setTitle('🛡️ Đã Thêm Admin').setDescription(`✅ Đã thêm thành công **${target.tag}** vào danh sách quản trị viên.`).setThumbnail(userAvatar);
                interaction.editReply({ embeds: [embed] });
            } else {
                await Admin.deleteOne({ user_id: target.id });
                const embed = new EmbedBuilder().setColor(getRandomColor()).setTitle('🛡️ Đã Xóa Admin').setDescription(`✅ Đã xóa **${target.tag}** khỏi danh sách quản trị viên.`).setThumbnail(userAvatar);
                interaction.editReply({ embeds: [embed] });
            }
        } 
        else if (commandName === 'createkey') {
            const isAdmin = await Admin.findOne({ user_id: userId });
            if (!isAdmin && userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Từ Chối Truy Cập').setDescription('Bạn không có quyền sử dụng lệnh này!').setThumbnail(userAvatar)] });
            }

            const duration = parseInt(interaction.options.getString('duration'));
            const targetUser = interaction.options.getUser('user');
            const keyStr = Math.floor(1000000000 + Math.random() * 9000000000).toString();
            const expiresAt = duration === 0 ? 0 : Date.now() + (duration * 24 * 60 * 60 * 1000);

            await new Key({ key: keyStr, expires_at: expiresAt, duration_days: duration }).save();
            
            if (userId !== OWNER_ID) {
                try { 
                    const ownerEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('📢 Thông Báo Admin Tạo Key Mới')
                        .setDescription(`• **Admin thực hiện:** <@${userId}>\n• **Thời hạn:** ${duration === 0 ? 'Vĩnh viễn' : duration + ' ngày'}\n• **Key:** ${keyStr}\n• **Gửi tới:** ${targetUser ? targetUser.tag : 'Không chọn'}`)
                        .setThumbnail(userAvatar)
                        .setTimestamp();
                    const owner = await client.users.fetch(OWNER_ID);
                    await owner.send({ embeds: [ownerEmbed] }); 
                } catch (e) {}
            }

            if (targetUser) {
                const targetAvatar = targetUser.displayAvatarURL({ dynamic: true });
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('🎉 Nhận Key Bản Quyền')
                        .setDescription(`Bạn vừa nhận được một key kích hoạt từ quản trị viên.\n\n• **Key:** ${keyStr}\n• **Thời hạn:** ${duration === 0 ? 'Vĩnh viễn' : duration + ' ngày'}\n\nHãy dùng lệnh \`/redeem key:${keyStr}\` trong server để kích hoạt!`)
                        .setThumbnail(targetAvatar);
                    await targetUser.send({ embeds: [dmEmbed] });

                    const replyEmbed = new EmbedBuilder().setColor(getRandomColor()).setTitle('🎟️ Đã Tạo Key Thành Công').setDescription(`✅ Đã tạo và gửi key trực tiếp qua DM cho **${targetUser.tag}**.\n• **Key:** ${keyStr}`).setThumbnail(userAvatar);
                    interaction.editReply({ embeds: [replyEmbed] });
                } catch (e) {
                    const replyEmbed = new EmbedBuilder().setColor(0xFFA500).setTitle('🎟️ Đã Tạo Key').setDescription(`⚠️ Không thể gửi DM cho **${targetUser.tag}**.\n• **Key:** ${keyStr}`).setThumbnail(userAvatar);
                    interaction.editReply({ embeds: [replyEmbed] });
                }
            } else {
                const replyEmbed = new EmbedBuilder().setColor(getRandomColor()).setTitle('🎟️ Đã Tạo Key Thành Công').setDescription(`✅ Khởi tạo key thành công:\n${keyStr}`).setThumbnail(userAvatar);
                interaction.editReply({ embeds: [replyEmbed] });
            }
        }
        else if (commandName === 'gettoken') {
            const isAdmin = await Admin.findOne({ user_id: userId });
            if (!isAdmin && userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Từ Chối').setDescription('Bạn không có quyền thực hiện lệnh này!').setThumbnail(userAvatar)] });
            }
            const targetUser = interaction.options.getUser('user');
            const tokenStr = `token_${Math.floor(100000 + Math.random() * 900000)}`;

            if (userId !== OWNER_ID) {
                try {
                    const ownerEmbed = new EmbedBuilder()
                        .setColor(0x00FFFF)
                        .setTitle('📢 Thông Báo Admin Tạo Token Reset HWID')
                        .setDescription(`• **Admin thực hiện:** <@${userId}>\n• **Token:** ${tokenStr}\n• **Gửi tới:** ${targetUser ? targetUser.tag : 'Không chọn'}`)
                        .setThumbnail(userAvatar)
                        .setTimestamp();
                    const owner = await client.users.fetch(OWNER_ID);
                    await owner.send({ embeds: [ownerEmbed] });
                } catch (e) {}
            }

            if (targetUser) {
                const targetAvatar = targetUser.displayAvatarURL({ dynamic: true });
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0x00FFFF)
                        .setTitle('🔑 Token Reset HWID Của Bạn')
                        .setDescription(`Token dùng để reset phần cứng:\n${tokenStr}`)
                        .setThumbnail(targetAvatar);
                    await targetUser.send({ embeds: [dmEmbed] });
                    
                    interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('✅ Thành Công').setDescription(`Đã gửi token reset HWID tới **${targetUser.tag}** qua DM.\n• Token: ${tokenStr}`).setThumbnail(userAvatar)] });
                } catch (e) {
                    interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('⚠️ Cảnh Báo').setDescription(`Không thể gửi DM cho user này. Token:\n${tokenStr}`).setThumbnail(userAvatar)] });
                }
            } else {
                interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🔑 Token Reset HWID').setDescription(`Token của bạn:\n${tokenStr}`).setThumbnail(userAvatar)] });
            }
        }
        else if (commandName === 'removekey') {
            if (userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Từ Chối').setDescription('Chỉ Owner mới có quyền xóa key!').setThumbnail(userAvatar)] });
            }
            const toolKey = interaction.options.getString('toolkey');
            const row = await Key.findOneAndDelete({ assigned_key: toolKey });
            
            if (!row) {
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Lỗi').setDescription(`Không tìm thấy key tool với mã: ${toolKey}`).setThumbnail(userAvatar)] });
            }
            interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🗑️ Đã Xóa Key').setDescription(`✅ Đã xóa vĩnh viễn key tool:\n${toolKey}`).setThumbnail(userAvatar)] });
        }
        else if (commandName === 'redeem') {
            const inputKey = interaction.options.getString('key');
            const row = await Key.findOne({ key: inputKey });
            
            if (!row) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Thất Bại').setDescription('Mã key không tồn tại trong hệ thống!').setThumbnail(userAvatar)] });
            if (row.is_used === 1 || row.assigned_key) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('⚠️ Thất Bại').setDescription('Mã key này đã được kích hoạt trước đó!').setThumbnail(userAvatar)] });
            if (row.expires_at !== 0 && Date.now() > row.expires_at) {
                await Key.deleteOne({ key: inputKey });
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Thất Bại').setDescription('Mã key này đã hết hạn sử dụng!').setThumbnail(userAvatar)] });
            }

            const assignedKey = `pain_key_${Math.floor(100000 + Math.random() * 900000)}`;
            row.assigned_key = assignedKey;
            row.user_id = userId;
            row.is_used = 1;
            await row.save();

            try {
                const ownerEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('🔔 Thông Báo Member Kích Hoạt Key')
                    .setDescription(`• **Thành viên:** <@${userId}> (\`${interaction.user.tag}\`)\n• **Key gốc:** ${inputKey}\n• **Tool Key được cấp:** ${assignedKey}`)
                    .setThumbnail(userAvatar)
                    .setTimestamp();
                const owner = await client.users.fetch(OWNER_ID);
                await owner.send({ embeds: [ownerEmbed] });
            } catch (e) {
                console.error('❌ Không thể gửi DM cho Owner khi Redeem:', e);
            }

            interaction.editReply({ 
                embeds: [
                    new EmbedBuilder()
                        .setColor(getRandomColor())
                        .setTitle('🎉 Kích Hoạt Thành Công')
                        .setDescription(`Kích hoạt thành công! Hãy dùng lệnh \`/getkey\` để lấy key.`)
                        .setThumbnail(userAvatar)
                ] 
            });
        }
        else if (commandName === 'resethwid') {
            const inputKey = interaction.options.getString('key');
            const tokenInput = interaction.options.getString('token');
            const row = await Key.findOne({ assigned_key: inputKey, user_id: userId });
            
            if (!row) return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Thất Bại').setDescription('Key không hợp lệ hoặc không thuộc sở hữu của bạn!').setThumbnail(userAvatar)] });

            const now = Date.now();
            if (row.expires_at !== 0 && now > row.expires_at) {
                await Key.deleteOne({ _id: row._id });
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Thất Bại').setDescription('Key của bạn đã hết hạn và bị xóa khỏi hệ thống!').setThumbnail(userAvatar)] });
            }

            const cooldown = 24 * 60 * 60 * 1000;

            if (!tokenInput && (now - row.last_reset < cooldown)) {
                const hoursLeft = Math.ceil((cooldown - (now - row.last_reset)) / 3600000);
                return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('⏳ Đang Chờ Cooldown').setDescription(`Vui lòng đợi thêm **${hoursLeft} giờ** nữa để reset HWID hoặc dùng token cấp phép.`).setThumbnail(userAvatar)] });
            }

            row.hwid = null;
            if (!tokenInput) {
                row.last_reset = now;
            }
            await row.save();

            interaction.editReply({ embeds: [new EmbedBuilder().setColor(getRandomColor()).setTitle('🔄 Reset HWID Thành Công').setDescription(`✅ Đã reset phần cứng thành công cho key: ${inputKey}${tokenInput ? ' (Dùng Token)' : ''}`).setThumbnail(userAvatar)] });
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
                const noKeyEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('⚠️ Không Tìm Thấy Key')
                    .setDescription('❌Bạn chưa sở hữu key nào.')
                    .setThumbnail(userAvatar)
                    .setTimestamp();
                return interaction.editReply({ embeds: [noKeyEmbed] });
            }

            const publicEmbed = new EmbedBuilder()
                .setColor(getRandomColor())
                .setTitle('🔑 Lấy Key & Trạng Thái')
                .setDescription('Vui lòng chọn key bạn muốn lấy và xem thống kê chi tiết ở menu chọn bên dưới.')
                .setThumbnail(userAvatar)
                .setTimestamp();

            const customSelectId = `select_getkey_${userId}`;

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(customSelectId)
                .setPlaceholder('vui lòng chọn key...')
                .addOptions(
                    userKeys.slice(0, 25).map((k, idx) => ({
                        label: `Key #${idx + 1}: ${k.assigned_key}`,
                        description: k.hwid ? 'Đã liên kết HWID' : 'Chưa liên kết HWID',
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
                        content: '❌ Bạn không thể thao tác trên menu của người khác!',
                        ephemeral: true
                    });
                }

                const selectedKeyStr = i.values[0];
                const row = await Key.findOne({ assigned_key: selectedKeyStr });
                const currentNow = Date.now();
                
                if (!row || row.user_id !== userId || (row.expires_at !== 0 && currentNow > row.expires_at)) {
                    if (row && row.expires_at !== 0 && currentNow > row.expires_at) {
                        await Key.deleteOne({ _id: row._id });
                    }
                    return i.reply({ 
                        content: '❌ Key này đã hết hạn sử dụng hoặc không còn tồn tại trong hệ thống!', 
                        ephemeral: true 
                    });
                }

                const cooldown = 24 * 60 * 60 * 1000;

                let expireText = r => r.expires_at === 0 ? 'Vĩnh viễn' : (r.expires_at > currentNow ? `<t:${Math.floor(r.expires_at / 1000)}:R>` : 'Đã hết hạn');
                let resetStatusText = '🟢 Đã sẵn sàng để reset hwid';

                if (row.last_reset && (currentNow - row.last_reset < cooldown)) {
                    const diffMs = cooldown - (currentNow - row.last_reset);
                    const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
                    const minsLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    resetStatusText = `🔴 Bạn còn **${hoursLeft} giờ ${minsLeft} phút** để reset lại`;
                }

                const detailEmbed = new EmbedBuilder()
                    .setColor(getRandomColor())
                    .setTitle('🔑 Thông Tin Key Của Bạn')
                    .setThumbnail(i.user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: '🔑 Your Key', value: row.assigned_key, inline: false },
                        { name: '⌛ Hạn Sử Dụng', value: expireText(row), inline: true },
                        { name: '🖥️ Trạng Thái HWID', value: row.hwid ? '🔒 Đã có HWID' : '🔓 Chưa có HWID', inline: true },
                        { name: '🔄 Trạng Thái Reset HWID', value: resetStatusText, inline: false }
                    )
                    .setTimestamp();

                await i.reply({ embeds: [detailEmbed], ephemeral: true });
            });

            collector.on('end', async () => {
                try {
                    const disabledMenu = StringSelectMenuBuilder.from(selectMenu)
                        .setDisabled(true)
                        .setPlaceholder(' ❌ Menu chọn key đã hết hiệu lực');
                    
                    const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);

                    await interaction.editReply({
                        components: [disabledRow]
                    });
                } catch (e) {}
            });
        }
    } catch (error) {
        console.error('❌ Lỗi xử lý lệnh:', error);
        interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('❌ Lỗi Hệ Thống').setDescription('Đã xảy ra lỗi không mong muốn khi xử lý yêu cầu!').setThumbnail(userAvatar)] });
    }
});

console.log('🤖 Đang tiến hành đăng nhập bot Discord...');
client.login(TOKEN).catch(err => {
    console.error('❌ LỖI ĐĂNG NHẬP DISCORD:', err);
});