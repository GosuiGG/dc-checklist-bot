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

// ================= MASTER MESSAGE =================
let checklistMessage = null;

// ================= REGISTER COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName('view')
    .setDescription('Show checklist status')
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

  const channel = await client.channels.fetch(CHANNEL_ID);

  // Load existing message
  if (db.messageId) {
    try {
      checklistMessage = await channel.messages.fetch(db.messageId);
    } catch {
      checklistMessage = null;
    }
  }

  // Create if missing
  if (!checklistMessage) {
    checklistMessage = await channel.send({
      embeds: [buildEmbed()],
      components: [buildButtons()]
    });

    await checklistMessage.pin().catch(() => {});
    db.messageId = checklistMessage.id;
    saveDB();
  }
});

// ================= INTERACTIONS =================
client.on('interactionCreate', async (interaction) => {

  // ================= BUTTONS (REAL-TIME UPDATE) =================
  if (interaction.isButton()) {

    db.checklist[interaction.customId] =
      !db.checklist[interaction.customId];

    saveDB();

    await interaction.deferUpdate();

    try {
      await checklistMessage.edit({
        embeds: [buildEmbed()],
        components: [buildButtons()]
      });
    } catch (err) {
      console.error("Button update failed:", err);
    }
  }

  // ================= /VIEW (NO BUTTONS, JUST STATUS) =================
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'view') {

      return interaction.reply({
        content:
`📋 **Checklist Status**
🔥 Streak: ${db.streak}

🟢 Ronin: ${db.checklist.ronin ? "Done" : "Pending"}
🟢 GA8: ${db.checklist.ga8 ? "Done" : "Pending"}
🟢 Bounty: ${db.checklist.bounty ? "Done" : "Pending"}
🟢 GA10: ${db.checklist.ga10 ? "Done" : "Pending"}

🔗 Open full checklist: ${checklistMessage?.url || "Not ready yet"}`,
        ephemeral: true
      });
    }
  }
});

// ================= START =================
client.login(TOKEN);