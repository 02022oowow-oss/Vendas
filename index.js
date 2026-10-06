const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const fs = require("fs");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID || "";
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID || "";
const CATEGORY_ID = process.env.CATEGORY_ID || "";
const PIX_KEY = process.env.PIX_KEY || "Configure a chave Pix";

if (!TOKEN) {
  console.error("ERRO: configure DISCORD_TOKEN nas variáveis do Railway.");
  process.exit(1);
}

const DATA_FILE = "./data.json";

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = { products: [], orders: [], nextProductId: 1, nextOrderId: 1 };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("Erro lendo data.json:", e);
    return { products: [], orders: [], nextProductId: 1, nextOrderId: 1 };
  }
}

let db = loadData();

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function isStaff(member) {
  return member.permissions?.has(PermissionFlagsBits.Administrator) ||
    (STAFF_ROLE_ID && member.roles?.cache?.has(STAFF_ROLE_ID));
}

function money(value) {
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function productListEmbed() {
  const embed = new EmbedBuilder()
    .setTitle("🛒 Loja")
    .setDescription("Escolha um produto abaixo para ver os detalhes e comprar.")
    .setTimestamp();

  if (!db.products.length) {
    embed.addFields({ name: "📦 Estoque", value: "Nenhum produto cadastrado ainda." });
    return embed;
  }

  for (const p of db.products.slice(0, 25)) {
    embed.addFields({
      name: `${p.name} • ${money(p.price)}`,
      value: `${p.description || "Sem descrição"}\n**Estoque:** ${p.stock > 0 ? p.stock : "ESGOTADO"}\nID: \`${p.id}\``,
      inline: false
    });
  }
  return embed;
}

function productMenu() {
  const options = db.products.slice(0, 25).map(p => ({
    label: p.name.slice(0, 100),
    description: `${money(p.price)} • Estoque: ${p.stock}`,
    value: String(p.id)
  }));

  if (!options.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("shop_buy_select")
      .setPlaceholder("Selecione um produto")
      .addOptions(options)
  );
}

function mainPanel() {
  const embed = new EmbedBuilder()
    .setTitle("🛍️ Loja")
    .setDescription(
      "Bem-vindo à nossa loja!\n\n" +
      "🛒 **Comprar** — veja os produtos disponíveis.\n" +
      "📦 **Meus pedidos** — consulte seus pedidos.\n" +
      "🎫 **Suporte** — abra um ticket.\n\n" +
      `💠 **Pix:** \`${PIX_KEY}\``
    )
    .setFooter({ text: "Use os botões abaixo para navegar." });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("shop_products").setLabel("Comprar").setEmoji("🛒").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("shop_orders").setLabel("Meus pedidos").setEmoji("📦").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("shop_support").setLabel("Suporte").setEmoji("🎫").setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

const commands = [
  new SlashCommandBuilder()
    .setName("painelloja")
    .setDescription("Envia o painel principal da loja.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("painelstaff")
    .setDescription("Abre o painel administrativo da loja.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log("Comandos registrados no servidor.");
  } else {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("Comandos globais registrados.");
  }
}

async function createTicket(guild, user, order) {
  const overwrites = [
    { id: guild.roles.everyone.id, deny: ["ViewChannel"] },
    { id: user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] }
  ];

  if (STAFF_ROLE_ID) {
    overwrites.push({
      id: STAFF_ROLE_ID,
      allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageChannels"]
    });
  }

  const channel = await guild.channels.create({
    name: `pedido-${order.id}`,
    type: ChannelType.GuildText,
    parent: CATEGORY_ID || undefined,
    permissionOverwrites: overwrites
  });

  order.channelId = channel.id;
  saveData();

  const embed = new EmbedBuilder()
    .setTitle(`🧾 Pedido #${order.id}`)
    .setDescription(
      `**Cliente:** <@${user.id}>\n` +
      `**Produto:** ${order.productName}\n` +
      `**Valor:** ${money(order.price)}\n` +
      `**Status:** 🟡 Aguardando pagamento\n\n` +
      `💠 **Pix:** \`${PIX_KEY}\`\n\n` +
      "Envie o comprovante neste ticket e aguarde a staff."
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`order_paid_${order.id}`).setLabel("Confirmar pagamento").setEmoji("💰").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`order_deliver_${order.id}`).setLabel("Entregar").setEmoji("📦").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`order_cancel_${order.id}`).setLabel("Cancelar").setEmoji("❌").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket_close_${order.id}`).setLabel("Fechar").setEmoji("🔒").setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ content: `<@${user.id}>`, embeds: [embed], components: [row] });
  return channel;
}

client.once("ready", async () => {
  console.log(`Bot online como ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (e) {
    console.error("Erro ao registrar comandos:", e);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "painelloja") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Apenas a staff pode usar este comando.", ephemeral: true });
        return interaction.reply(mainPanel());
      }

      if (interaction.commandName === "painelstaff") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Apenas a staff pode usar este comando.", ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle("👑 Painel Staff")
          .setDescription("Gerencie produtos e pedidos da loja.");

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("staff_add").setLabel("Adicionar produto").setEmoji("➕").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("staff_edit").setLabel("Editar produto").setEmoji("✏️").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("staff_stock").setLabel("Alterar estoque").setEmoji("📦").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("staff_remove").setLabel("Remover produto").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
        );
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }
    }

    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === "shop_products") {
        return interaction.reply({
          embeds: [productListEmbed()],
          components: productMenu() ? [productMenu()] : [],
          ephemeral: true
        });
      }

      if (id === "shop_orders") {
        const orders = db.orders.filter(o => o.userId === interaction.user.id).slice(-10).reverse();
        const embed = new EmbedBuilder().setTitle("📦 Meus pedidos");
        if (!orders.length) embed.setDescription("Você ainda não possui pedidos.");
        else embed.setDescription(orders.map(o => `**#${o.id}** • ${o.productName} • ${money(o.price)} • ${o.status}`).join("\n"));
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (id === "shop_support") {
        const order = {
          id: `SUP-${interaction.user.id.slice(-5)}-${Date.now().toString().slice(-4)}`,
          userId: interaction.user.id,
          productName: "Suporte",
          price: 0,
          status: "🟢 Suporte",
          createdAt: Date.now()
        };
        const channel = await createTicket(interaction.guild, interaction.user, order);
        return interaction.reply({ content: `✅ Ticket criado: ${channel}`, ephemeral: true });
      }

      if (id === "staff_add") {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Apenas staff.", ephemeral: true });
        const modal = new ModalBuilder().setCustomId("modal_add_product").setTitle("Adicionar produto");
        const name = new TextInputBuilder().setCustomId("name").setLabel("Nome").setStyle(TextInputStyle.Short).setRequired(true);
        const price = new TextInputBuilder().setCustomId("price").setLabel("Preço (ex: 10.50)").setStyle(TextInputStyle.Short).setRequired(true);
        const stock = new TextInputBuilder().setCustomId("stock").setLabel("Estoque").setStyle(TextInputStyle.Short).setRequired(true);
        const desc = new TextInputBuilder().setCustomId("description").setLabel("Descrição").setStyle(TextInputStyle.Paragraph).setRequired(false);
        modal.addComponents(
          new ActionRowBuilder().addComponents(name),
          new ActionRowBuilder().addComponents(price),
          new ActionRowBuilder().addComponents(stock),
          new ActionRowBuilder().addComponents(desc)
        );
        return interaction.showModal(modal);
      }

      if (["staff_edit", "staff_stock", "staff_remove"].includes(id)) {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Apenas staff.", ephemeral: true });
        if (!db.products.length) return interaction.reply({ content: "❌ Não existem produtos.", ephemeral: true });

        const menu = new StringSelectMenuBuilder()
          .setCustomId(id + "_select")
          .setPlaceholder("Selecione o produto")
          .addOptions(db.products.slice(0,25).map(p => ({
            label: p.name.slice(0,100),
            description: `${money(p.price)} • estoque ${p.stock}`,
            value: String(p.id)
          })));
        return interaction.reply({ content: "Escolha o produto:", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
      }

      if (id.startsWith("order_")) {
        const parts = id.split("_");
        const action = parts[1];
        const orderId = parts[2];
        const order = db.orders.find(o => String(o.id) === String(orderId));

        if (!order) return interaction.reply({ content: "❌ Pedido não encontrado.", ephemeral: true });
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Apenas a staff pode gerenciar pedidos.", ephemeral: true });

        if (action === "paid") {
          order.status = "🟢 Pagamento confirmado";
          saveData();
          return interaction.reply("✅ Pagamento confirmado.");
        }

        if (action === "deliver") {
          order.status = "🔵 Entregue";
          saveData();
          await interaction.reply("📦 Pedido marcado como entregue.");
          return;
        }

        if (action === "cancel") {
          order.status = "🔴 Cancelado";
          saveData();
          await interaction.reply("❌ Pedido cancelado.");
          return;
        }
      }

      if (id.startsWith("ticket_close_")) {
        if (!isStaff(interaction.member)) return interaction.reply({ content: "❌ Apenas a staff pode fechar este ticket.", ephemeral: true });
        await interaction.reply("🔒 Fechando ticket...");
        setTimeout(() => interaction.channel.delete().catch(() => {}), 1500);
        return;
      }
    }

    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      const productId = Number(interaction.values[0]);

      if (id === "shop_buy_select") {
        const p = db.products.find(x => x.id === productId);
        if (!p) return interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true });
        if (p.stock <= 0) return interaction.reply({ content: "❌ Este produto está esgotado.", ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`buy_confirm_${p.id}`).setLabel(`Comprar por ${money(p.price)}`).setEmoji("🛒").setStyle(ButtonStyle.Success)
        );
        const embed = new EmbedBuilder().setTitle(`🛍️ ${p.name}`).setDescription(`${p.description || "Sem descrição"}\n\n**Preço:** ${money(p.price)}\n**Estoque:** ${p.stock}`);
        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      if (id === "staff_edit_select") {
        const p = db.products.find(x => x.id === productId);
        if (!p) return interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`modal_edit_${p.id}`).setTitle("Editar produto");
        const name = new TextInputBuilder().setCustomId("name").setLabel("Nome").setStyle(TextInputStyle.Short).setValue(p.name).setRequired(true);
        const price = new TextInputBuilder().setCustomId("price").setLabel("Preço").setStyle(TextInputStyle.Short).setValue(String(p.price)).setRequired(true);
        const stock = new TextInputBuilder().setCustomId("stock").setLabel("Estoque").setStyle(TextInputStyle.Short).setValue(String(p.stock)).setRequired(true);
        const desc = new TextInputBuilder().setCustomId("description").setLabel("Descrição").setStyle(TextInputStyle.Paragraph).setValue(p.description || "").setRequired(false);
        modal.addComponents(new ActionRowBuilder().addComponents(name), new ActionRowBuilder().addComponents(price), new ActionRowBuilder().addComponents(stock), new ActionRowBuilder().addComponents(desc));
        return interaction.showModal(modal);
      }

      if (id === "staff_stock_select") {
        const p = db.products.find(x => x.id === productId);
        if (!p) return interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`modal_stock_${p.id}`).setTitle("Alterar estoque");
        const stock = new TextInputBuilder().setCustomId("stock").setLabel("Novo estoque").setStyle(TextInputStyle.Short).setValue(String(p.stock)).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(stock));
        return interaction.showModal(modal);
      }

      if (id === "staff_remove_select") {
        const p = db.products.find(x => x.id === productId);
        if (!p) return interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true });
        db.products = db.products.filter(x => x.id !== productId);
        saveData();
        return interaction.reply({ content: `🗑️ Produto **${p.name}** removido.`, ephemeral: true });
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith("buy_confirm_")) {
      const productId = Number(interaction.customId.split("_")[2]);
      const p = db.products.find(x => x.id === productId);
      if (!p || p.stock <= 0) return interaction.reply({ content: "❌ Produto esgotado ou não encontrado.", ephemeral: true });

      p.stock -= 1;
      const order = {
        id: db.nextOrderId++,
        userId: interaction.user.id,
        productId: p.id,
        productName: p.name,
        price: p.price,
        status: "🟡 Aguardando pagamento",
        createdAt: Date.now()
      };
      db.orders.push(order);
      saveData();

      const channel = await createTicket(interaction.guild, interaction.user, order);
      return interaction.reply({ content: `✅ Pedido #${order.id} criado! ${channel}`, ephemeral: true });
    }

    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      if (id === "modal_add_product") {
        const price = Number(interaction.fields.getTextInputValue("price").replace(",", "."));
        const stock = Number.parseInt(interaction.fields.getTextInputValue("stock"), 10);
        if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) return interaction.reply({ content: "❌ Preço ou estoque inválido.", ephemeral: true });

        db.products.push({
          id: db.nextProductId++,
          name: interaction.fields.getTextInputValue("name"),
          price,
          stock,
          description: interaction.fields.getTextInputValue("description") || ""
        });
        saveData();
        return interaction.reply({ content: "✅ Produto adicionado.", ephemeral: true });
      }

      if (id.startsWith("modal_edit_")) {
        const productId = Number(id.split("_")[2]);
        const p = db.products.find(x => x.id === productId);
        if (!p) return interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true });

        const price = Number(interaction.fields.getTextInputValue("price").replace(",", "."));
        const stock = Number.parseInt(interaction.fields.getTextInputValue("stock"), 10);
        if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) return interaction.reply({ content: "❌ Preço ou estoque inválido.", ephemeral: true });

        p.name = interaction.fields.getTextInputValue("name");
        p.price = price;
        p.stock = stock;
        p.description = interaction.fields.getTextInputValue("description") || "";
        saveData();
        return interaction.reply({ content: "✅ Produto atualizado.", ephemeral: true });
      }

      if (id.startsWith("modal_stock_")) {
        const productId = Number(id.split("_")[2]);
        const p = db.products.find(x => x.id === productId);
        if (!p) return interaction.reply({ content: "❌ Produto não encontrado.", ephemeral: true });

        const stock = Number.parseInt(interaction.fields.getTextInputValue("stock"), 10);
        if (!Number.isInteger(stock) || stock < 0) return interaction.reply({ content: "❌ Estoque inválido.", ephemeral: true });

        p.stock = stock;
        saveData();
        return interaction.reply({ content: `📦 Estoque de **${p.name}** atualizado para **${stock}**.`, ephemeral: true });
      }
    }
  } catch (error) {
    console.error(error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: "❌ Ocorreu um erro. Veja os logs do Railway.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);
