const {
  Client, GatewayIntentBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, REST, Routes, SlashCommandBuilder
} = require('discord.js');

const cron = require('node-cron');
const fs = require('fs');

// ================= CONFIG =================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID;

const REMINDERS_CHANNEL_ID = process.env.REMINDERS_CHANNEL_ID;

// ================= CLIENT =================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ================= DB =================
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
${db.checklist.ronin ? '✅' : '⬜'} Ronin  
${db.checklist.ga8 ? '✅' : '⬜'} GA 8AM  

🕚 11AM
${db.checklist.bounty ? '✅' : '⬜'} Bounty  

🌙 10PM
${db.checklist.ga10 ? '✅' : '⬜'} GA 10PM`
    )
    .setFooter({ text: "Live checklist system" });
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

// ================= STATE =================
let checklistMessage = null;

// ================= COMMAND =================
const commands = [
  new SlashCommandBuilder()
    .setName('view')
    .setDescription('View checklist')
    .toJSON()
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
}

// ================= READY =================
client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();

  const channel = await client.channels.fetch(CHANNEL_ID);

  // 🔥 LOAD EXISTING MESSAGE ONLY
  if (db.messageId) {
    try {
      checklistMessage = await channel.messages.fetch(db.messageId);
    } catch {
      checklistMessage = null;
    }
  }

  // 🔥 CREATE ONLY ONCE
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

// ================= BUTTON HANDLER =================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  db.checklist[interaction.customId] =
    !db.checklist[interaction.customId];

  saveDB();

  await interaction.deferUpdate();

  if (checklistMessage) {
    await checklistMessage.edit({
      embeds: [buildEmbed()],
      components: [buildButtons()]
    });
  }
});

// ================= /VIEW =================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'view') {
    return interaction.reply({
      embeds: [buildEmbed()],
      ephemeral: true
    });
  }
});

// ================= 8AM RESET =================
cron.schedule('0 8 * * *', async () => {

  const allDone = Object.values(db.checklist).every(v => v);

  db.streak = allDone ? db.streak + 1 : 0;

  db.checklist = {
    ronin: false,
    ga8: false,
    bounty: false,
    ga10: false
  };

  saveDB();

  if (checklistMessage) {
    await checklistMessage.edit({
      embeds: [buildEmbed()],
      components: [buildButtons()]
    });
  }

  const ch = await client.channels.fetch(REMINDERS_CHANNEL_ID);
  ch.send(`@here 🔄 Daily checklist RESET`);

}, { timezone: "Asia/Manila" });

// ================= 1-HOUR BEFORE REMINDERS ONLY =================
const tasks = [
  { name: "Ronin + GA8", hour: 7 },
  { name: "Bounty", hour: 10 },
  { name: "GA10", hour: 21 }
];

tasks.forEach(t => {
  cron.schedule(`0 ${t.hour} * * *`, async () => {
    const ch = await client.channels.fetch(REMINDERS_CHANNEL_ID);

    ch.send(`@here ⏰ 1 HOUR LEFT → **${t.name}**`);
  }, { timezone: "Asia/Manila" });
});

// ================= START =================
client.login(TOKEN);