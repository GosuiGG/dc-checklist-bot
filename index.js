const { 
  Client, GatewayIntentBits, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, REST, Routes, SlashCommandBuilder
} = require('discord.js');

const cron = require('node-cron');
const fs = require('fs');

// ================= CONFIG =================
const TOKEN = 'process.env.TOKEN';
const CLIENT_ID = '1497845608386662400';
const CHANNEL_ID = '1497848304950579292';
const GUILD_ID = '768882091940511784';

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

// ================= SAFE DB =================
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
  } catch (err) {
    fs.writeFileSync('./data.json', JSON.stringify(DEFAULT_DB, null, 2));
    return DEFAULT_DB;
  }
}

function saveDB() {
  try {
    fs.writeFileSync('./data.json', JSON.stringify(db, null, 2));
  } catch (err) {
    console.log("Save error:", err);
  }
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
${db.checklist.ga10 ? '✅' : '⬜'} GA Contest  
`
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
  const channel = await client.channels.fetch(CHANNEL_ID);

  let msg;

  try {
    if (!db.messageId) throw new Error("no message");

    msg = await channel.messages.fetch(db.messageId);

    await msg.edit({
      embeds: [buildEmbed()],
      components: [buildButtons()]
    });

  } catch {
    msg = await channel.send({
      embeds: [buildEmbed()],
      components: [buildButtons()]
    });

    db.messageId = msg.id;
    await msg.pin().catch(() => {});
  }

  saveDB();
}

// ================= RESET =================
function resetChecklist() {
  const allDone = Object.values(db.checklist).every(v => v === true);

  if (allDone) db.streak++;
  else db.streak = 0;

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
    .setDescription('View checklist')
    .toJSON()
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Slash commands registered instantly");
}

// ================= READY =================
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();
  await updateMessage();

  // 8AM PH RESET
  cron.schedule('0 8 * * *', async () => {
    resetChecklist();
    await updateMessage();
  }, { timezone: "Asia/Manila" });
});

// ================= BUTTON HANDLER =================
client.on('interactionCreate', async interaction => {
  // BUTTONS
  if (interaction.isButton()) {
    db.checklist[interaction.customId] = !db.checklist[interaction.customId];
    saveDB();
    await updateMessage();
    return interaction.deferUpdate();
  }

  // /view COMMAND
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'view') {
      return interaction.reply({
        embeds: [buildEmbed()],
        ephemeral: true
      });
    }
  }
});

// ================= START =================
client.login(process.env.TOKEN);