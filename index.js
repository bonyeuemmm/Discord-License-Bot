const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, Collection, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const TOKEN = "MTU0MzI5NjgzMTMzMTUwODM1OA.G6xyGR.Bga0ExEemYqMrqk3lVditd35dTGiFzC1XY2mSs";
const CLIENT_ID = '1543296831331508358';
const OWNER_ID = '1208450889246048306';
const EMBED_COLOR = 0x9b59b6;
const EMBED_FOOTER = {
  text: 'Bot by @paingamer999',
  iconURL: 'https://i.postimg.cc/gJbhCmHL/Pain-Gamer.png'
};
const EMBED_THUMBNAIL = 'https://i.postimg.cc/gJbhCmHL/Pain-Gamer.png';

const dbFile = './keys.json';
if (!fs.existsSync(dbFile)) { fs.writeFileSync(dbFile, JSON.stringify({})); }
let keyDatabase = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));

const linksFile = './links.json';
if (!fs.existsSync(linksFile)) { fs.writeFileSync(linksFile, JSON.stringify({})); }
let linksDatabase = JSON.parse(fs.readFileSync(linksFile, 'utf-8'));

const accessFile = './access.json';
if (!fs.existsSync(accessFile)) { fs.writeFileSync(accessFile, JSON.stringify({})); }
let accessDatabase = JSON.parse(fs.readFileSync(accessFile, 'utf-8'));

const adminsFile = './admins.json';
if (!fs.existsSync(adminsFile)) { fs.writeFileSync(adminsFile, JSON.stringify([])); }
let adminDatabase = JSON.parse(fs.readFileSync(adminsFile, 'utf-8'));

const usersFile = './users.json';
if (!fs.existsSync(usersFile)) { fs.writeFileSync(usersFile, JSON.stringify([])); }
let userDatabase = [...new Set(JSON.parse(fs.readFileSync(usersFile, 'utf-8')))];

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages] 
});
const commandCooldowns = new Collection();
const COMMAND_COOLDOWN_MS = 4_000;
const COOLDOWN_CLEANUP_INTERVAL_MS = 60_000;

const cooldownCleanup = setInterval(() => {
  const cutoff = Date.now() - COMMAND_COOLDOWN_MS;
  for (const [userId, lastInteractionAt] of commandCooldowns) {
    if (lastInteractionAt <= cutoff) {
      commandCooldowns.delete(userId);
    }
  }
}, COOLDOWN_CLEANUP_INTERVAL_MS);
cooldownCleanup.unref();

const commands = [
  new SlashCommandBuilder()
    .setName('addadmin')
    .setDescription('Thêm người dùng làm Admin Bot')
    .addUserOption(option => option.setName('user').setDescription('Chọn người dùng muốn cấp quyền').setRequired(true)),
    
  new SlashCommandBuilder()
    .setName('removeadmin')
    .setDescription('Xóa quyền Admin Bot')
    .addUserOption(option => option.setName('user').setDescription('Chọn người dùng muốn xóa quyền').setRequired(true)),

  new SlashCommandBuilder()
    .setName('createkey')
    .setDescription('Tạo key mới')
    .addStringOption(option =>
      option.setName('duration')
        .setDescription('Thời hạn của key')
        .setRequired(true)
        .addChoices(
          { name: '1 Ngày', value: '1d' },
          { name: '3 Ngày', value: '3d' },
          { name: '7 Ngày', value: '7d' },
          { name: '30 Ngày', value: '30d' },
          { name: 'Vĩnh viễn', value: 'permanent' }
        )
    )
    .addUserOption(option => option
      .setName('target_user')
      .setDescription('Member nhận key (không bắt buộc)')
      .setRequired(false)),
    
  new SlashCommandBuilder()
    .setName('setlinkclone')
    .setDescription('Tạo và thiết lập link tải cho từng mục riêng')
    .addStringOption(option => option.setName('category').setDescription('Tên mục muốn tạo (VD: Roblox)').setRequired(true))
    .addStringOption(option => option
      .setName('region')
      .setDescription('Khu vực của link')
      .setRequired(true)
      .addChoices(
        { name: 'Global', value: 'global' },
        { name: 'VNG', value: 'vng' }
      ))
    .addStringOption(option => option.setName('link').setDescription('Đường link tải của mục này').setRequired(true)),

  new SlashCommandBuilder()
    .setName('deletelink')
    .setDescription('Xóa một mục link hoặc khu vực cụ thể')
    .addStringOption(option => option
      .setName('category')
      .setDescription('Chọn mục muốn xóa')
      .setRequired(true)
      .setAutocomplete(true))
    .addStringOption(option => option
      .setName('region')
      .setDescription('Chọn khu vực muốn xóa (mặc định xóa toàn bộ mục)')
      .setRequired(false)
      .addChoices(
        { name: 'Global', value: 'global' },
        { name: 'VNG', value: 'vng' },
        { name: 'Tất cả (Xóa cả mục)', value: 'all' }
      )),

  new SlashCommandBuilder()
    .setName('redeemkey')
    .setDescription('Nhập key để kích hoạt')
    .addStringOption(option => option.setName('key').setDescription('Nhập mã key').setRequired(true)),

  new SlashCommandBuilder()
    .setName('removekey')
    .setDescription('Xóa key và thu hồi quyền của member')
    .addStringOption(option => option.setName('key').setDescription('Key cần xóa').setRequired(true)),

  new SlashCommandBuilder()
    .setName('getclone')
    .setDescription('Lấy link tải theo mục và khu vực')
    .addStringOption(option => option
      .setName('category')
      .setDescription('Chọn mục muốn lấy link')
      .setRequired(true)
      .setAutocomplete(true))
    .addStringOption(option => option
      .setName('region')
      .setDescription('Chọn khu vực')
      .setRequired(true)
      .addChoices(
        { name: 'Global', value: 'global' },
        { name: 'VNG', value: 'vng' }
      )),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Hướng dẫn sử dụng bot'),

  new SlashCommandBuilder()
    .setName('notification')
    .setDescription('Gửi thông báo đến các member đã sử dụng bot')
    .addStringOption(option => option
      .setName('message')
      .setDescription('Nội dung thông báo muốn gửi')
      .setRequired(true)
      .setMaxLength(2000))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('OK');
  } catch (error) {
    console.error(error);
  }
})();

function generateRandomKey() {
  const randomDigits = Math.floor(100000 + Math.random() * 900000);
  return `pain_${randomDigits}`;
}

function isBotAdmin(userId) {
  return userId === OWNER_ID || adminDatabase.includes(userId);
}

function rememberUser(userId) {
  if (userDatabase.includes(userId)) return;

  userDatabase.push(userId);
  fs.writeFileSync(usersFile, JSON.stringify(userDatabase, null, 2));
}

function formatExpiry(expireTimestamp) {
  if (expireTimestamp === -1) return 'Vĩnh viễn';
  if (expireTimestamp == null) return 'Chưa kích hoạt';
  return `<t:${Math.floor(expireTimestamp / 1000)}:R>`;
}

function getDurationMilliseconds(duration) {
  if (duration === '1d') return 1 * 24 * 60 * 60 * 1000;
  if (duration === '3d') return 3 * 24 * 60 * 60 * 1000;
  if (duration === '7d') return 7 * 24 * 60 * 60 * 1000;
  if (duration === '30d') return 30 * 24 * 60 * 60 * 1000;
  if (duration === 'permanent') return -1;
  return null;
}

function formatDuration(durationMs) {
  if (durationMs === -1) return 'Vĩnh viễn kể từ lúc redeem';
  if (durationMs == null) return 'Theo thời hạn cũ của key';

  const durationDays = durationMs / (24 * 60 * 60 * 1000);
  return `${durationDays} ngày kể từ lúc redeem`;
}

function isKeyExpired(keyData, now = Date.now()) {
  if (!keyData) return true;
  if (keyData.expiresAt === -1) return false;

  const isActivated = Number.isFinite(keyData.activatedAt);
  const hasLegacyExpiry = !isActivated && Number.isFinite(keyData.expiresAt);
  if (!isActivated && !hasLegacyExpiry) return false;

  return Number.isFinite(keyData.expiresAt) && now >= keyData.expiresAt;
}

function createBotEmbed({ title, description, fields, thumbnail } = {}) {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setFooter(EMBED_FOOTER)
    .setThumbnail(thumbnail || EMBED_THUMBNAIL);

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields?.length) embed.addFields(fields);

  return embed;
}

async function notifyOwner(embed) {
  try {
    const owner = await client.users.fetch(OWNER_ID);
    await owner.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error('Không thể gửi DM thông báo cho Owner:', error);
    return false;
  }
}

function saveAccessDatabase() {
  fs.writeFileSync(accessFile, JSON.stringify(accessDatabase, null, 2));
}

function saveKeyDatabase() {
  fs.writeFileSync(dbFile, JSON.stringify(keyDatabase, null, 2));
}

function getValidAccessKey(userId) {
  const activeKey = accessDatabase[userId];
  if (!activeKey) return null;

  const keyData = keyDatabase[activeKey];
  const expired = isKeyExpired(keyData);

  if (!keyData || keyData.redeemedBy !== userId || expired) {
    delete accessDatabase[userId];
    if (keyData?.redeemedBy === userId) {
      delete keyData.redeemedBy;
    }
    saveAccessDatabase();
    if (expired) {
      delete keyDatabase[activeKey];
      saveKeyDatabase();
    }
    return null;
  }

  return activeKey;
}

function getLinkForCategoryAndRegion(categoryName, region) {
  const categoryLinks = refreshLinksDatabase()[categoryName];

  if (typeof categoryLinks === 'string') {
    return region === 'global' ? categoryLinks : null;
  }

  if (!categoryLinks || typeof categoryLinks !== 'object') {
    return null;
  }

  return categoryLinks[region] || null;
}

function refreshLinksDatabase() {
  linksDatabase = JSON.parse(fs.readFileSync(linksFile, 'utf-8'));
  return linksDatabase;
}
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName !== 'deletelink' && interaction.commandName !== 'getclone') return;

    const focusedValue = interaction.options.getFocused().toLowerCase();
    const linkCategories = Object.keys(refreshLinksDatabase())
      .filter(categoryName => categoryName.toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map(categoryName => ({
        name: categoryName,
        value: categoryName
      }));

    return await interaction.respond(linkCategories);
  }

  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;
  if (userId !== OWNER_ID) {
    const now = Date.now();
    const lastInteractionAt = commandCooldowns.get(userId);

    if (lastInteractionAt && now - lastInteractionAt < COMMAND_COOLDOWN_MS) {
      return await interaction.reply({
        embeds: [
          createBotEmbed({
            title: '⚠️ Anti-spam',
            description: '⚠️ Bạn đang thao tác quá nhanh, vui lòng đợi vài giây rồi thử lại!'
          })
        ],
        ephemeral: true
      });
    }

    commandCooldowns.set(userId, now);
  }

  rememberUser(interaction.user.id);
  const { commandName } = interaction;

  if (commandName === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('📖 Hướng dẫn sử dụng bot')
      .setDescription('Các lệnh cần thiết để sử dụng hệ thống link và key.')
      .setThumbnail(EMBED_THUMBNAIL)
      .addFields(
        {
          name: '👥 Member',
          value: [
            '`/getclone category:<mục> region:<Global/VNG>` — Lấy link theo mục và khu vực sau khi có quyền key.',
            '`/redeemkey key:<mã-key>` — Nhập key để mở khóa toàn bộ link.'
          ].join('\n')
        },
        {
          name: '🛠️ Admin',
          value: [
            '`/setlinkclone category:<tên-mục> region:<Global/VNG> link:<đường-dẫn>` — Thêm hoặc cập nhật link.',
            '`/deletelink category:<mục> region:<khu-vực>` — Xóa một mục link hoặc khu vực cụ thể.',
            '`/createkey duration:<thời-hạn> target_user:<member>` — Tạo key, có thể gửi tự động cho member.'
          ].join('\n')
        },
        {
          name: '👑 Owner',
          value: [
            '`/createkey duration:<thời-hạn> target_user:<member>` — Tạo key và gửi key cho member nếu chọn.',
            '`/removekey key:<mã-key>` — Xóa key và thu hồi quyền member đang gắn với key.',
            '`/notification message:<nội-dung>` — Gửi thông báo DM đến member đã từng dùng bot.'
          ].join('\n')
        }
      )
      .setFooter(EMBED_FOOTER);

    return await interaction.reply({
      embeds: [helpEmbed],
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }

  if (commandName === 'notification') {
    if (interaction.user.id !== OWNER_ID) {
      return await interaction.reply({
        content: '❌ Lỗi: Chỉ Chủ sở hữu Bot mới có quyền gửi thông báo!',
        ephemeral: true
      });
    }

    const message = interaction.options.getString('message', true).trim();
    await interaction.deferReply({ ephemeral: true });

    const recipientIds = [...new Set(userDatabase)];
    let successCount = 0;
    let failedCount = 0;

    for (const userId of recipientIds) {
      try {
        const user = await client.users.fetch(userId);
        await user.send({
          embeds: [
            createBotEmbed({
              title: '👑 Thông báo từ Owner',
              description: message
            })
          ]
        });
        successCount += 1;
      } catch (_error) {
        failedCount += 1;
      }
    }

    return await interaction.editReply(
      `✅ Đã gửi thông báo đến ${successCount}/${recipientIds.length} member.\n` +
      `❌ Gửi thất bại: ${failedCount} member.`
    );
  }

  if (commandName === 'addadmin' || commandName === 'removeadmin') {
    if (interaction.user.id !== OWNER_ID) {
      return await interaction.reply({ content: '❌ Lỗi: Chỉ Chủ sở hữu Bot mới có quyền dùng lệnh này!', ephemeral: true });
    }

    const targetUser = interaction.options.getUser('user');

    if (commandName === 'addadmin') {
      if (!adminDatabase.includes(targetUser.id)) {
        adminDatabase.push(targetUser.id);
        fs.writeFileSync(adminsFile, JSON.stringify(adminDatabase, null, 2));
      }
      return await interaction.reply({ content: `✅ Đã cấp quyền Admin Bot cho: ${targetUser.tag}`, ephemeral: true });
    } 
    else {
      adminDatabase = adminDatabase.filter(id => id !== targetUser.id);
      fs.writeFileSync(adminsFile, JSON.stringify(adminDatabase, null, 2));
      return await interaction.reply({ content: `✅ Đã thu hồi quyền Admin Bot cho: ${targetUser.tag}`, ephemeral: true });
    }
  }

  if (commandName === 'setlinkclone') {
    if (!isBotAdmin(interaction.user.id)) {
      return await interaction.reply({ content: '❌ Bạn không có quyền sử dụng lệnh này!', ephemeral: true });
    }

    const categoryName = interaction.options.getString('category').trim();
    const region = interaction.options.getString('region');
    const linkUrl = interaction.options.getString('link').trim();

    const existingCategory = linksDatabase[categoryName];
    const categoryLinks = typeof existingCategory === 'string'
      ? { global: existingCategory }
      : { ...(existingCategory || {}) };
    categoryLinks[region] = linkUrl;
    linksDatabase[categoryName] = categoryLinks;
    fs.writeFileSync(linksFile, JSON.stringify(linksDatabase, null, 2));

    await interaction.reply({
      content: `✅ Đã thiết lập thành công mục \`${categoryName}\` (${region === 'global' ? 'Global' : 'VNG'}) với link: ${linkUrl}`,
      ephemeral: true
    });
  }

  else if (commandName === 'deletelink') {
    if (!isBotAdmin(interaction.user.id)) {
      return await interaction.reply({ content: '❌ Bạn không có quyền sử dụng lệnh này!', ephemeral: true });
    }

    const categoryName = interaction.options.getString('category').trim();
    const region = interaction.options.getString('region') || 'all';
    refreshLinksDatabase();

    if (!Object.prototype.hasOwnProperty.call(linksDatabase, categoryName)) {
      return await interaction.reply({
        content: `❌ Không tìm thấy mục \`${categoryName}\` trong danh sách link!`,
        ephemeral: true
      });
    }

    if (region === 'all' || typeof linksDatabase[categoryName] === 'string') {
      delete linksDatabase[categoryName];
      fs.writeFileSync(linksFile, JSON.stringify(linksDatabase, null, 2));
      return await interaction.reply({
        content: `✅ Đã xóa toàn bộ mục link \`${categoryName}\` thành công!`,
        ephemeral: true
      });
    }

    const categoryObj = linksDatabase[categoryName];
    if (!categoryObj[region]) {
      return await interaction.reply({
        content: `❌ Mục \`${categoryName}\` không có link cho khu vực \`${region === 'global' ? 'Global' : 'VNG'}\`!`,
        ephemeral: true
      });
    }

    delete categoryObj[region];

    if (Object.keys(categoryObj).length === 0) {
      delete linksDatabase[categoryName];
    }

    fs.writeFileSync(linksFile, JSON.stringify(linksDatabase, null, 2));

    return await interaction.reply({
      content: `✅ Đã xóa link khu vực \`${region === 'global' ? 'Global' : 'VNG'}\` của mục \`${categoryName}\` thành công!`,
      ephemeral: true
    });
  }

  else if (commandName === 'createkey') {
    if (!isBotAdmin(interaction.user.id)) {
      return await interaction.reply({ content: '❌ Bạn không có quyền sử dụng lệnh này!', ephemeral: true });
    }

    const duration = interaction.options.getString('duration');
    const targetUser = interaction.options.getUser('target_user');
    await interaction.deferReply({ ephemeral: true });
    
    let generatedKey = generateRandomKey();
    while (keyDatabase[generatedKey]) { generatedKey = generateRandomKey(); }

    const durationMs = getDurationMilliseconds(duration);
    keyDatabase[generatedKey] = {
      durationMs,
      activatedAt: null,
      expiresAt: null
    };
    fs.writeFileSync(dbFile, JSON.stringify(keyDatabase, null, 2));

    const durationText = formatDuration(durationMs);
    let responseMessage = '';
    let targetUserDetails = 'Không gửi cho member cụ thể';

    if (targetUser) {
      try {
        const fetchedTargetUser = await client.users.fetch(targetUser.id);
        await fetchedTargetUser.send({
          embeds: [
            createBotEmbed({
              title: '🔑 Bạn đã được cấp một key',
              description:
                `Mã key: \`${generatedKey}\`\n\n` +
                `Thời hạn: ${durationText}\n\n` +
                `Dùng lệnh \`/redeemkey key:${generatedKey}\` để mở khóa toàn bộ link.`
            })
          ]
        });
        responseMessage = `✅ Đã tạo key \`${generatedKey}\` và tự động gửi DM cho ${fetchedTargetUser.tag}!`;
        targetUserDetails = `Đã gửi cho ${fetchedTargetUser.tag} (ID: ${fetchedTargetUser.id})`;
      } catch (error) {
        responseMessage = `⚠️ Đã tạo key \`${generatedKey}\`, nhưng không thể gửi DM cho ${targetUser.tag}.`;
        targetUserDetails = `Gửi thất bại cho ${targetUser.tag} (ID: ${targetUser.id})`;
      }
    } else {
      responseMessage = `✅ Đã tạo key: \`${generatedKey}\` (Mở khóa toàn bộ link - Thời hạn: ${durationText})`;
    }

    await interaction.editReply({ content: responseMessage });

    await notifyOwner(
      createBotEmbed({
        title: '🔑 Key mới được tạo',
        fields: [
          { name: 'Người tạo', value: `${interaction.user.tag}\nID: ${interaction.user.id}` },
          { name: 'Key', value: `\`${generatedKey}\`` },
          { name: 'Thời hạn', value: durationText },
          { name: 'Đối tượng nhận', value: targetUserDetails }
        ]
      })
    );
  }

  else if (commandName === 'removekey') {
    if (interaction.user.id !== OWNER_ID) {
      return await interaction.reply({
        content: '❌ Lỗi: Chỉ Chủ sở hữu Bot mới có quyền xóa key!',
        ephemeral: true
      });
    }

    const userKey = interaction.options.getString('key', true).trim();
    const keyData = keyDatabase[userKey];

    if (!keyData) {
      return await interaction.reply({
        content: `❌ Key \`${userKey}\` không tồn tại hoặc đã được xóa.`,
        ephemeral: true
      });
    }

    const revokedUserIds = new Set();
    if (keyData.redeemedBy) {
      revokedUserIds.add(keyData.redeemedBy);
    }

    for (const [userId, activeKey] of Object.entries(accessDatabase)) {
      if (activeKey === userKey) {
        revokedUserIds.add(userId);
        delete accessDatabase[userId];
      }
    }

    delete keyDatabase[userKey];
    saveKeyDatabase();
    saveAccessDatabase();

    const revokedText = revokedUserIds.size > 0
      ? ` Đã thu hồi quyền của ${revokedUserIds.size} member.`
      : ' Key chưa được member nào redeem.';

    return await interaction.reply({
      content: `✅ Đã xóa vĩnh viễn key \`${userKey}\` và cập nhật cơ sở dữ liệu.${revokedText}`,
      ephemeral: true
    });
  }

  else if (commandName === 'getclone') {
    if (!getValidAccessKey(interaction.user.id)) {
      return await interaction.reply({
        content: '❌ Bạn chưa có quyền sử dụng link. Hãy nhập key bằng lệnh `/redeemkey` trước.',
        ephemeral: true
      });
    }

    const categoryName = interaction.options.getString('category', true).trim();
    const region = interaction.options.getString('region', true);
    const linkUrl = getLinkForCategoryAndRegion(categoryName, region);

    if (!linkUrl) {
      return await interaction.reply({
        content: 'Hiện tại chưa có link cho mục này.',
        ephemeral: true
      });
    }

    return await interaction.reply({
      embeds: [
        createBotEmbed({
          title: '🔗 Link tải',
          fields: [
            { name: 'Mục', value: categoryName, inline: true },
            { name: 'Khu vực', value: region === 'global' ? 'Global' : 'VNG', inline: true },
            { name: 'Đường dẫn', value: linkUrl }
          ]
        })
      ],
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }

  else if (commandName === 'redeemkey') {
    const userKey = interaction.options.getString('key').trim();
    const keyData = keyDatabase[userKey];

    if (!keyData) {
      return await interaction.reply({ content: `❌ Key không tồn tại hoặc đã nhập sai!`, ephemeral: true });
    }

    const now = Date.now();
    if (isKeyExpired(keyData, now)) {
      delete keyDatabase[userKey];
      if (accessDatabase[interaction.user.id] === userKey) {
        delete accessDatabase[interaction.user.id];
      }
      saveKeyDatabase();
      saveAccessDatabase();
      try {
        await interaction.user.send({
          embeds: [
            createBotEmbed({
              title: '⚠️ Key đã hết hạn',
              description: `Key \`${userKey}\` của bạn đã hết hạn và quyền truy cập đã được thu hồi.`
            })
          ]
        });
      } catch (err) {}
      return await interaction.reply({ content: `❌ Key đã hết hạn và đã thông báo qua DM!`, ephemeral: true });
    }

    if (keyData.redeemedBy && keyData.redeemedBy !== interaction.user.id) {
      return await interaction.reply({
        content: '❌ Key này đã được member khác sử dụng và không thể redeem lại.',
        ephemeral: true
      });
    }

    const activatedAt = Date.now();
    if (Number.isFinite(keyData.durationMs)) {
      keyData.activatedAt = activatedAt;
      keyData.expiresAt = keyData.durationMs === -1
        ? -1
        : activatedAt + keyData.durationMs;
    } else if (keyData.expiresAt === -1) {
      keyData.activatedAt = activatedAt;
    }

    const previousKey = accessDatabase[interaction.user.id];
    if (previousKey && previousKey !== userKey && keyDatabase[previousKey]?.redeemedBy === interaction.user.id) {
      delete keyDatabase[previousKey].redeemedBy;
    }

    keyData.redeemedBy = interaction.user.id;
    accessDatabase[interaction.user.id] = userKey;
    saveKeyDatabase();
    saveAccessDatabase();

    await interaction.reply({
      embeds: [
        createBotEmbed({
          description: '✅ Nhập key thành công! Bạn đã được mở khóa quyền sử dụng bot.'
        })
      ],
      ephemeral: true,
      allowedMentions: { parse: [] }
    });

    await notifyOwner(
      createBotEmbed({
        title: '✅ Member đã redeem key thành công',
        fields: [
          { name: 'Username', value: interaction.user.tag },
          { name: 'ID member', value: interaction.user.id },
          { name: 'Key đã sử dụng', value: `\`${userKey}\`` },
          { name: 'Kích hoạt lúc', value: `<t:${Math.floor(activatedAt / 1000)}:F>` },
          { name: 'Hết hạn', value: formatExpiry(keyData.expiresAt) }
        ]
      })
    );
  }
});

client.once('ready', () => { console.log(`Bot ${client.user.tag} Online!`); });
client.login(TOKEN);
