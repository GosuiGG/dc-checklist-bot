const { 
  Client, GatewayIntentBits, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, REST, Routes, SlashCommandBuilder
} = require('discord.js');

const cron = require('node-cron');
const fs = require('fs');

// ================= CONFIG =================
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN in environment variables");
  process.exit(1);
}

const CLIENT_ID = process.env.CLIENT_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID;

// ================= CLIENT =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ================= DEFAULT DB =================
const DEFAULT_DB = {
  messageId: null,
  checklist: {
    ronin: false,
    ga8: false,
    bounty: false,
    ga10: false
  },
  streak: 0
};

// ================= DB =================
let db = loadDB();

function loadDB() {
  try {
    if (!fs.existsSync('./data.json')) {
      fs.writeFileSync('./data.json', JSON.stringify(DEFAULT_DB, null, 2));
      return DEFAULT_DB;
    }

    const raw = fs.readFileSync('./data.json');
    const data = JSON.parse(raw);

    return {
      ...DEFAULT_DB,
      ...data,
      checklist: {
        ...DEFAULT_DB.checklist,
        ...(data.checklist || {})
      }
    };
  } catch {
    fs.writeFileSync('./data.json', JSON.stringify(DEFAULT_DB, null, 2));
    return DEFAULT_DB;
  }
}

function saveDB() {
  fs.writeFileSync('./data.json', JSON.stringify(db, null, 2));
}

// ================= EMBED =================
function buildEmbed() {
  return new EmbedBuilder()
    .setTitle("📋 Daily Checklist")
    .setColor(0x00AE86)
    .setDescription(
`🔥 **Streak:** ${db.streak}

🕗 8AM
${db.checklist.ronin ? '✅' : '⬜'} Ronin Bounties  
${db.checklist.ga8 ? '✅' : '⬜'} GA Contest  

🕚 11AM
${db.checklist.bounty ? '✅' : '⬜'} Bounty Board  

🌙 10PM
${db.checklist.ga10 ? '✅' : '⬜'} GA Contest`
    )
    .setFooter({ text: "Auto-updates | Resets 8AM PH Time" });
}

// ================= BUTTONS =================
function buildButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ronin').setLabel('Ronin').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ga8').setLabel('GA 8AM').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bounty').setLabel('Bounty').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ga10').setLabel('GA 10PM').setStyle(ButtonStyle.Primary)
  );
}

// ================= UPDATE MESSAGE =================
async function updateMessage() {
  if (!db.messageId) return;

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const msg = await channel.messages.fetch(db.messageId);

    await msg.edit({
      embeds: [buildEmbed()],
      components: [buildButtons()]
    });

  } catch (err) {
    console.error("Update failed:", err);
  }
}

// ================= RESET =================
function resetChecklist() {
  const allDone = Object.values(db.checklist).every(v => v);

  db.streak = allDone ? db.streak + 1 : 0;

  db.checklist = {
    ronin: false,
    ga8: false,
    bounty: false,
    ga10: false
  };

  saveDB();
}

// ================= SLASH COMMAND =================
const commands = [
  new SlashCommandBuilder()
    .setName('view')
    .setDescription('Open checklist dashboard')
    .toJSON()
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Slash commands registered");
}

// ================= READY =================
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();

  // Create ONE persistent message
  const channel = await client.channels.fetch(CHANNEL_ID);

  if (!db.messageId) {
    const msg = await channel.send({
      embeds: [buildEmbed()],
      components: [buildButtons()]
    });

    db.messageId = msg.id;
    saveDB();
  }

  cron.schedule('0 8 * * *', async () => {
    resetChecklist();
    await updateMessage();
  }, { timezone: "Asia/Manila" });
});

// ================= INTERACTIONS =================
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  // toggle value
  db.checklist[interaction.customId] =
    !db.checklist[interaction.customId];

  saveDB();

  await interaction.deferUpdate();

  // ALWAYS update the same master message
  const channel = await client.channels.fetch(CHANNEL_ID);

  try {
    const msg = await channel.messages.fetch(db.messageId);

    await msg.edit({
      embeds: [buildEmbed()],
      components: [buildButtons()]
    });

  } catch (err) {
    console.error("Button update failed:", err);
  }
});

// ================= START =================
client.login(TOKEN);