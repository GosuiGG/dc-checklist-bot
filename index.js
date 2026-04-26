const { 
  Client, GatewayIntentBits, 
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, REST, Routes, SlashCommandBuilder
} = require('discord.js');

const fs = require('fs');

// ================= CONFIG =================
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN");
  process.exit(1);
}

const CLIENT_ID = process.env.CLIENT_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const GUILD_ID = process.env.GUILD_ID;

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
${db.checklist.ronin ? '✅' : '⬜'} Ronin Bounties  
${db.checklist.ga8 ? '✅' : '⬜'} GA Contest  

🕚 11AM
${db.checklist.bounty ? '✅' : '⬜'} Bounty Board  

🌙 10PM
${db.checklist.ga10 ? '✅' : '⬜'} GA Contest`
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

// ================= /VIEW BUTTON =================
function viewButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Open Checklist")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${GUILD_ID}/${CHANNEL_ID}/${db.messageId}`)
  );
}

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

  console.log("✅ Commands registered");
}

// ================= READY =================
let checklistMessage = null;

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await registerCommands();

  const channel = await client.channels.fetch(CHANNEL_ID);

  if (db.messageId) {
    try {
      checklistMessage = await channel.messages.fetch(db.messageId);
    } catch {
      checklistMessage = null;
    }
  }

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

  // BUTTONS ON MAIN CHECKLIST
  if (interaction.isButton()) {

    db.checklist[interaction.customId] =
      !db.checklist[interaction.customId];

    saveDB();

    await interaction.deferUpdate();

    await checklistMessage.edit({
      embeds: [buildEmbed()],
      components: [buildButtons()]
    });
  }

  // /VIEW COMMAND
  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === 'view') {

      return interaction.reply({
        embeds: [buildEmbed()],
        components: [viewButton()],
        ephemeral: true
      });
    }
  }
});

// ================= START =================
client.login(TOKEN);