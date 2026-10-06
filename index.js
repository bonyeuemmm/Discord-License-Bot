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

// ═══════════════════════════════════════════════════════════════
// PROFESSIONAL COLOR SCHEME
// ═══════════════════════════════════════════════════════════════
const COLORS = {
    PRIMARY: 0x0E9FFF,        // Xanh dương chính
    SUCCESS: 0x00D084,        // Xanh lá
    ERROR: 0xFF4444,          // Đỏ
    WARNING: 0xFFB800,        // Cam
    INFO: 0x5865F2,           // Tím Discord
    NEUTRAL: 0x36393F,        // Xám
    GOLD: 0xFFA500            // Vàng
};

const getFooterOptions = () => ({
    text: 'PAIN TOOL © 2024',
    iconURL: FOOTER_ICON_URL
});

// ═══════════════════════════════════════════════════════════════
// EMBED BUILDERS - PROFESSIONAL TEMPLATES
// ═══════════════════════════════════════════════════════════════

const createSuccessEmbed = (title, description, userAvatar = null) => 
    new EmbedBuilder()
        .setColor(COLORS.SUCCESS)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setThumbnail(userAvatar)
        .setFooter(getFooterOptions());

const createErrorEmbed = (title, description, userAvatar = null) => 
    new EmbedBuilder()
        .setColor(COLORS.ERROR)
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setThumbnail(userAvatar)
        .setFooter(getFooterOptions());

const createWarningEmbed = (title, description, userAvatar = null) => 
    new EmbedBuilder()
        .setColor(COLORS.WARNING)
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .setThumbnail(userAvatar)
        .setFooter(getFooterOptions());

const createInfoEmbed = (title, description, userAvatar = null) => 
    new EmbedBuilder()
        .setColor(COLORS.PRIMARY)
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setThumbnail(userAvatar)
        .setFooter(getFooterOptions());

const createKeyEmbed = (keyValue, title = "API Key", userAvatar = null) => 
    new EmbedBuilder()
        .setColor(COLORS.GOLD)
        .setTitle(`🔑 ${title}`)
        .setDescription(`\`\`\`\n${keyValue}\n\`\`\``)
        .setThumbnail(userAvatar)
        .setFooter(getFooterOptions());

const createAdminNotifyEmbed = (action, user, details = {}, userAvatar = null) => {
    const embed = new EmbedBuilder()
        .setColor(COLORS.INFO)
        .setTitle(`📢 Admin Activity: ${action}`)
        .addFields(
            { name: '👤 Executed By', value: `<@${user.id}>\n${user.tag}`, inline: false },
            { name: '⏰ Timestamp', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        );
    
    for (const [key, value] of Object.entries(details)) {
        embed.addField(`📌 ${key}`, value || 'N/A', false);
    }
    
    return embed.setThumbnail(userAvatar).setFooter(getFooterOptions());
};

async function notifyOwner(client, embed) {
    try {
        const owner = await client.users.fetch(OWNER_ID);
        if (owner) {
            await owner.send({ embeds: [embed] });
            console.log('✅ Owner notification sent.');
        }
    } catch (e) {
        console.error('❌ Failed to notify owner:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// MONGODB SCHEMAS
// ═══════════════════════════════════════════════════════════════

const adminSchema = new mongoose.Schema({ user_id: String });
const Admin = mongoose.model('Admin', adminSchema);

const keySchema = new mongoose.Schema({
    key: String,
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

console.log('🔄 Connecting to MongoDB Atlas...');
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Atlas connected!'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ═══════════════════════════════════════════════════════════════
// EXPRESS API - AUTHENTICATION
// ═══════════════════════════════════════════════════════════════

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.status(200).json({ status: 'API running', version: '1.0' });
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
        console.error("❌ API Error:", e);
        res.json({ valid: false, reason: "server_error" }); 
    }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 API Server running on port ${PORT}`);
});

// ═══════════════════════════════════════════════════════════════
// DISCORD BOT CLIENT
// ═══════════════════════════════════════════════════════════════

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
    new SlashCommandBuilder().setName('setadmin').setDescription('Quản lý danh sách Admin')
        .addStringOption(opt => opt.setName('action').setDescription('Thao tác').setRequired(true).addChoices({ name: 'Thêm', value: 'add' }, { name: 'Xóa', value: 'remove' }))
        .addUserOption(opt => opt.setName('user').setDescription('Người dùng').setRequired(true)),
    
    new SlashCommandBuilder().setName('createkey').setDescription('Tạo key mới')
        .addStringOption(opt => opt.setName('duration').setDescription('Thời hạn').setRequired(true).addChoices({name: '1 Day', value: '1'}, {name: '3 Days', value: '3'}, {name: '7 Days', value: '7'}, {name: '30 Days', value: '30'}, {name: 'Forever', value: '0'}))
        .addUserOption(opt => opt.setName('user').setDescription('Gửi DM tới').setRequired(false)),
    
    new SlashCommandBuilder().setName('gettoken').setDescription('Tạo token reset HWID')
        .addUserOption(opt => opt.setName('user').setDescription('Gửi tới').setRequired(false)),
    
    new SlashCommandBuilder().setName('getkey').setDescription('Xem key của bạn'),
    
    new SlashCommandBuilder().setName('removekey').setDescription('Xóa key (Owner only)')
        .addStringOption(opt => opt.setName('toolkey').setDescription('Key cần xóa').setRequired(true)),
    
    new SlashCommandBuilder().setName('redeem').setDescription('Kích hoạt key')
        .addStringOption(opt => opt.setName('key').setDescription('Nhập key').setRequired(true)),
    
    new SlashCommandBuilder().setName('resethwid').setDescription('Reset HWID')
        .addStringOption(opt => opt.setName('key').setDescription('Key của bạn').setRequired(true).setAutocomplete(true))
        .addStringOption(opt => opt.setName('token').setDescription('Token (tùy chọn)').setRequired(false)),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        console.log('🔄 Registering commands...');
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Commands registered!');
    } catch (error) {
        console.error('❌ Command registration failed:', error);
    }
})();

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    await interaction.deferReply({ ephemeral: false }).catch(() => {});

    const commandName = interaction.commandName;
    const userId = interaction.user.id;
    const userAvatar = interaction.user.displayAvatarURL({ dynamic: true });

    if (userId !== OWNER_ID) {
        if (!cooldowns.has(userId)) cooldowns.set(userId, new Map());
        const timestamps = cooldowns.get(userId);
        const now = Date.now();
        if (timestamps.has(commandName) && now < timestamps.get(commandName) + COOLDOWN_TIME) {
            const waitTime = ((timestamps.get(commandName) + COOLDOWN_TIME - now) / 1000).toFixed(1);
            return interaction.editReply({ 
                embeds: [createWarningEmbed('Cooldown Active', `Please wait **${waitTime}s** before using this again.`, userAvatar)] 
            });
        }
        timestamps.set(commandName, now);
        setTimeout(() => timestamps.delete(commandName), COOLDOWN_TIME);
    }

    try {
        if (commandName === 'setadmin') {
            if (userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [createErrorEmbed('Access Denied', 'Only Owner can execute this!', userAvatar)] });
            }
            const action = interaction.options.getString('action');
            const target = interaction.options.getUser('user');

            if (action === 'add') {
                await Admin.findOneAndUpdate({ user_id: target.id }, { user_id: target.id }, { upsert: true });
                const embed = createSuccessEmbed('Admin Added', `**${target.tag}** has been added to admin list.`, userAvatar);
                await interaction.editReply({ embeds: [embed] });
            } else {
                await Admin.deleteOne({ user_id: target.id });
                const embed = createSuccessEmbed('Admin Removed', `**${target.tag}** has been removed from admin list.`, userAvatar);
                await interaction.editReply({ embeds: [embed] });
            }
        } 
        else if (commandName === 'createkey') {
            const isAdmin = await Admin.exists({ user_id: userId });
            if (!isAdmin && userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [createErrorEmbed('Access Denied', 'You do not have permission!', userAvatar)] });
            }

            const duration = parseInt(interaction.options.getString('duration'));
            const targetUser = interaction.options.getUser('user');
            const keyStr = Math.floor(100000000000 + Math.random() * 900000000000).toString();
            const expiresAt = duration === 0 ? 0 : Date.now() + (duration * 24 * 60 * 60 * 1000);

            await new Key({ key: keyStr, expires_at: expiresAt, duration_days: duration }).save();
            
            if (userId !== OWNER_ID) {
                const ownerEmbed = createAdminNotifyEmbed('Key Created', interaction.user, {
                    'Duration': duration === 0 ? '∞ Forever' : `${duration} days`,
                    'Recipient': targetUser ? targetUser.tag : 'Not assigned',
                    'Master Key': `\`\`\`\n${keyStr}\n\`\`\``
                }, userAvatar);
                await notifyOwner(client, ownerEmbed);
            }

            if (targetUser) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(COLORS.GOLD)
                        .setTitle('🎉 Activation Key Received')
                        .setDescription(`You've received a premium key!\n\n**Master Key:**\n\`\`\`\n${keyStr}\n\`\`\`\n\n**Duration:** ${duration === 0 ? '∞ Forever' : duration + ' days'}\n\n📝 Use \`/redeem key:${keyStr}\` to activate!`)
                        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                        .setFooter(getFooterOptions());
                    
                    await targetUser.send({ embeds: [dmEmbed] });
                    const replyEmbed = createSuccessEmbed('Key Sent', `Key delivered to **${targetUser.tag}** via DM.\n\n\`\`\`\n${keyStr}\n\`\`\``, userAvatar);
                    await interaction.editReply({ embeds: [replyEmbed] });
                } catch (e) {
                    const replyEmbed = createWarningEmbed('Key Created', `DM failed for **${targetUser.tag}**.\n\n\`\`\`\n${keyStr}\n\`\`\``, userAvatar);
                    await interaction.editReply({ embeds: [replyEmbed] });
                }
            } else {
                const replyEmbed = createSuccessEmbed('Key Created', `\`\`\`\n${keyStr}\n\`\`\``, userAvatar);
                await interaction.editReply({ embeds: [replyEmbed] });
            }
        }
        else if (commandName === 'gettoken') {
            const isAdmin = await Admin.exists({ user_id: userId });
            if (!isAdmin && userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [createErrorEmbed('Access Denied', 'You do not have permission!', userAvatar)] });
            }

            const targetUser = interaction.options.getUser('user');
            const tokenStr = `token_${Math.floor(100000 + Math.random() * 900000)}`;

            if (userId !== OWNER_ID) {
                const ownerEmbed = createAdminNotifyEmbed('HWID Reset Token Created', interaction.user, {
                    'Token': `\`\`\`\n${tokenStr}\n\`\`\``,
                    'Sent To': targetUser ? targetUser.tag : 'Not assigned'
                }, userAvatar);
                await notifyOwner(client, ownerEmbed);
            }

            if (targetUser) {
                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor(COLORS.INFO)
                        .setTitle('🔑 HWID Reset Token')
                        .setDescription(`\`\`\`\n${tokenStr}\n\`\`\``)
                        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                        .setFooter(getFooterOptions());
                    
                    await targetUser.send({ embeds: [dmEmbed] });
                    await interaction.editReply({ embeds: [createSuccessEmbed('Token Sent', `Token delivered to **${targetUser.tag}** via DM.\n\n\`\`\`\n${tokenStr}\n\`\`\``, userAvatar)] });
                } catch (e) {
                    await interaction.editReply({ embeds: [createWarningEmbed('Token Created', `DM failed.\n\n\`\`\`\n${tokenStr}\n\`\`\``, userAvatar)] });
                }
            } else {
                await interaction.editReply({ embeds: [createKeyEmbed(tokenStr, 'HWID Reset Token', userAvatar)] });
            }
        }
        else if (commandName === 'removekey') {
            if (userId !== OWNER_ID) {
                return interaction.editReply({ embeds: [createErrorEmbed('Access Denied', 'Only Owner can delete keys!', userAvatar)] });
            }

            const toolKey = interaction.options.getString('toolkey');
            const row = await Key.findOneAndDelete({ assigned_key: toolKey });
            
            if (!row) {
                return interaction.editReply({ embeds: [createErrorEmbed('Key Not Found', `No key found with that ID:\n\n\`\`\`\n${toolKey}\n\`\`\``, userAvatar)] });
            }

            await interaction.editReply({ embeds: [createSuccessEmbed('Key Deleted', `Key permanently removed:\n\n\`\`\`\n${toolKey}\n\`\`\``, userAvatar)] });
        }
        else if (commandName === 'redeem') {
            const inputKey = interaction.options.getString('key');
            const row = await Key.findOne({ key: inputKey });
            
            if (!row) return interaction.editReply({ embeds: [createErrorEmbed('Redeem Failed', 'Key not found in system!', userAvatar)] });
            if (row.is_used === 1 || row.assigned_key) return interaction.editReply({ embeds: [createWarningEmbed('Already Used', 'This key has been activated already!', userAvatar)] });
            if (row.expires_at !== 0 && Date.now() > row.expires_at) {
                await Key.deleteOne({ key: inputKey });
                return interaction.editReply({ embeds: [createErrorEmbed('Expired', 'This key has expired!', userAvatar)] });
            }

            const assignedKey = `pain_key_${Math.floor(100000 + Math.random() * 900000)}`;
            let newExpiresAt = row.expires_at;
            if (row.duration_days > 0) {
                newExpiresAt = Date.now() + (row.duration_days * 24 * 60 * 60 * 1000);
            }

            row.assigned_key = assignedKey;
            row.user_id = userId;
            row.is_used = 1;
            row.expires_at = newExpiresAt;
            await row.save();

            const ownerEmbed = createAdminNotifyEmbed('Key Activated', interaction.user, {
                'Assigned Key': `\`\`\`\n${assignedKey}\n\`\`\``,
                'Duration': row.duration_days === 0 ? '∞ Forever' : `${row.duration_days} days`,
                'Expires': row.expires_at === 0 ? 'Never' : `<t:${Math.floor(row.expires_at / 1000)}:F>`
            }, userAvatar);
            await notifyOwner(client, ownerEmbed);

            const replyEmbed = new EmbedBuilder()
                .setColor(COLORS.SUCCESS)
                .setTitle('🎉 Activation Successful')
                .setDescription('Your key has been activated!')
                .addFields(
                    { name: '🔑 Tool Key', value: `\`\`\`\n${assignedKey}\n\`\`\``, inline: false },
                    { name: '⏰ Expires', value: row.expires_at === 0 ? '∞ Forever' : `<t:${Math.floor(row.expires_at / 1000)}:R>`, inline: true }
                )
                .setThumbnail(userAvatar)
                .setFooter(getFooterOptions());

            await interaction.editReply({ embeds: [replyEmbed] });
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
                return interaction.editReply({ embeds: [createInfoEmbed('No Keys', 'You don\'t have any active keys.', userAvatar)] });
            }

            const publicEmbed = new EmbedBuilder()
                .setColor(COLORS.PRIMARY)
                .setTitle('🔑 My Keys')
                .setDescription(`You have **${userKeys.length}** active key(s). Select one below:`)
                .setThumbnail(userAvatar)
                .setFooter(getFooterOptions());

            const customSelectId = `select_getkey_${userId}`;
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(customSelectId)
                .setPlaceholder('Choose a key...')
                .addOptions(
                    userKeys.slice(0, 25).map((k, idx) => ({
                        label: `Key #${idx + 1}`,
                        description: k.hwid ? '🔒 Linked' : '🔓 Not Linked',
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
                        content: '❌ This menu is not for you!',
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
                        content: '❌ This key has expired or no longer exists!', 
                        ephemeral: true 
                    });
                }

                const cooldown = 24 * 60 * 60 * 1000;
                let expireText = row.expires_at === 0 ? '∞ Forever' : `<t:${Math.floor(row.expires_at / 1000)}:R>`;
                let resetStatusText = '🟢 Ready';

                if (row.last_reset && (currentNow - row.last_reset < cooldown)) {
                    const diffMs = cooldown - (currentNow - row.last_reset);
                    const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60));
                    const minsLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    resetStatusText = `🔴 Wait ${hoursLeft}h ${minsLeft}m`;
                }

                const detailEmbed = new EmbedBuilder()
                    .setColor(COLORS.GOLD)
                    .setTitle('🔑 Key Details')
                    .addFields(
                        { name: '🎯 Tool Key', value: `\`\`\`\n${row.assigned_key}\n\`\`\``, inline: false },
                        { name: '⏰ Expires', value: expireText, inline: true },
                        { name: '🖥️ Device', value: row.hwid ? '🔒 Linked' : '🔓 Not Linked', inline: true },
                        { name: '🔄 HWID Reset', value: resetStatusText, inline: false }
                    )
                    .setThumbnail(i.user.displayAvatarURL({ dynamic: true }))
                    .setFooter(getFooterOptions());

                await i.reply({ embeds: [detailEmbed], ephemeral: true });
            });

            collector.on('end', async () => {
                try {
                    const disabledMenu = StringSelectMenuBuilder.from(selectMenu)
                        .setDisabled(true)
                        .setPlaceholder('❌ Menu expired');
                    
                    const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);
                    await interaction.editReply({ components: [disabledRow] });
                } catch (e) {}
            });
        }
        else if (commandName === 'resethwid') {
            const inputKey = interaction.options.getString('key');
            const tokenInput = interaction.options.getString('token');
            const row = await Key.findOne({ assigned_key: inputKey, user_id: userId });
            
            if (!row) return interaction.editReply({ embeds: [createErrorEmbed('Invalid Key', 'Key not found or not yours!', userAvatar)] });

            const now = Date.now();
            if (row.expires_at !== 0 && now > row.expires_at) {
                await Key.deleteOne({ _id: row._id });
                return interaction.editReply({ embeds: [createErrorEmbed('Expired', 'Your key has expired!', userAvatar)] });
            }

            const cooldown = 24 * 60 * 60 * 1000;

            if (!tokenInput && (now - row.last_reset < cooldown)) {
                const hoursLeft = Math.ceil((cooldown - (now - row.last_reset)) / 3600000);
                return interaction.editReply({ embeds: [createWarningEmbed('Cooldown', `Wait **${hoursLeft}h** or use a token.`, userAvatar)] });
            }

            row.hwid = null;
            if (!tokenInput) {
                row.last_reset = now;
            }
            await row.save();

            await interaction.editReply({ embeds: [createSuccessEmbed('HWID Reset', `HWID reset successfully for:\n\n\`\`\`\n${inputKey}\n\`\`\``, userAvatar)] });
        }
    } catch (error) {
        console.error('❌ Command Error:', error);
        await interaction.editReply({ embeds: [createErrorEmbed('System Error', 'An unexpected error occurred!', userAvatar)] }).catch(() => {});
    }
});

console.log('🤖 Logging into Discord...');
client.login(TOKEN).catch(err => {
    console.error('❌ Discord Login Failed:', err);
});
