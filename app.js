// ============================================================
// APP — Lista de Produtos da Doceria
// Sem frameworks: HTML + CSS + JavaScript puro.
// ============================================================

// Cliente do Supabase (a biblioteca cria a variável global "supabase")
const db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

// ---------- Estado em memória ----------
let produtos = []; // lista de produtos vinda do banco
let vendas = []; // movimentações de venda usadas no resumo
let travaSalvar = false; // trava simples contra toque duplo em Salvar/Excluir
let ultimasVendasPorProduto = {};

const CATEGORIA_PADRAO = "geladinho";
const ABA_RESUMO = "resumo";
const VENDAS_CONTAR_A_PARTIR_DE = "2026-09-29T03:29:32.211Z";
const TEMPO_DESFAZER_VENDA_MS = 2 * 60 * 1000;
const CATEGORIAS = [
  {
    id: "geladinho",
    nome: "Geladinho",
    plural: "geladinhos",
    tituloNovo: "Novo geladinho",
    placeholderNovo: "Nome (ex: Ninho com Oreo)",
    textoSalvar: "Salvar geladinho",
    textoGerarImagem: "📸 Gerar imagem dos geladinhos",
    tituloVendas: "Vendas dos geladinhos",
    tituloImagem: "Geladinhos disponíveis hoje",
    vazioLista: "Nenhum geladinho cadastrado ainda. Use o formulário acima para começar.",
    vazioImagem: "Nenhum geladinho ativo nesta aba. Cadastre ou ative algum para gerar a imagem.",
  },
  {
    id: "trufas",
    nome: "Trufas",
    plural: "trufas",
    tituloNovo: "Nova trufa",
    placeholderNovo: "Nome (ex: Trufa de morango)",
    textoSalvar: "Salvar trufa",
    textoGerarImagem: "📸 Gerar imagem das trufas",
    tituloVendas: "Vendas das trufas",
    tituloImagem: "Trufas disponíveis hoje",
    vazioLista: "Nenhuma trufa cadastrada ainda. Use o formulário acima para começar.",
    vazioImagem: "Nenhuma trufa ativa nesta aba. Cadastre ou ative alguma para gerar a imagem.",
  },
  {
    id: "doces",
    nome: "Doces",
    plural: "doces",
    tituloNovo: "Novo doce",
    placeholderNovo: "Nome (ex: Brigadeiro)",
    textoSalvar: "Salvar doce",
    textoGerarImagem: "📸 Gerar imagem dos doces",
    tituloVendas: "Vendas dos doces",
    tituloImagem: "Doces disponíveis hoje",
    vazioLista: "Nenhum doce cadastrado ainda. Use o formulário acima para começar.",
    vazioImagem: "Nenhum doce ativo nesta aba. Cadastre ou ative algum para gerar a imagem.",
  },
];
const RESUMO_CONFIG = {
  id: ABA_RESUMO,
  nome: "Vendas",
  textoGerarImagem: "",
  tituloVendas: "Vendas gerais",
  vazioLista: "",
  vazioImagem: "",
};

let categoriaAtual = CATEGORIA_PADRAO;
let mostrarPrecosImagem = true;
let imagensPorCategoria = criarEstadoImagens();

// ---------- Referências de elementos ----------
const el = (id) => document.getElementById(id);

const listaProdutos = el("lista-produtos");
const estadoVazio = el("estado-vazio");
const carregando = el("carregando");
const avisoErro = el("aviso-erro");
const indicadorCarregando = el("indicador-carregando");
const abasCategorias = Array.from(document.querySelectorAll(".aba-categoria"));

// ============================================================
// INICIALIZAÇÃO
// ============================================================

function aplicarConfiguracaoVisual() {
  document.documentElement.style.setProperty("--cor-principal", CONFIG.COR_PRINCIPAL);
  document.documentElement.style.setProperty("--cor-principal-clara", corClara(CONFIG.COR_PRINCIPAL));
  const metaTema = document.querySelector('meta[name="theme-color"]');
  if (metaTema) metaTema.setAttribute("content", CONFIG.COR_PRINCIPAL);
  el("nome-doceria").textContent = CONFIG.NOME_DOCERIA;
  document.title = CONFIG.NOME_DOCERIA;
}

// Gera uma versão bem clara da cor principal, para fundos suaves
function corClara(hex) {
  const { r, g, b } = hexParaRgb(hex);
  const misturar = (canal) => Math.round(canal + (255 - canal) * 0.88);
  return `rgb(${misturar(r)}, ${misturar(g)}, ${misturar(b)})`;
}

function hexParaRgb(hex) {
  const limpo = hex.replace("#", "");
  const bigint = parseInt(limpo.length === 3
    ? limpo.split("").map((c) => c + c).join("")
    : limpo, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function criarEstadoImagens() {
  return CATEGORIAS.reduce((estado, categoria) => {
    estado[categoria.id] = { blob: null, url: "" };
    return estado;
  }, {});
}

function categoriaConfig(categoriaId = categoriaAtual) {
  if (categoriaId === ABA_RESUMO) return RESUMO_CONFIG;
  return CATEGORIAS.find((categoria) => categoria.id === categoriaId) || CATEGORIAS[0];
}

function categoriaValida(categoriaId) {
  return categoriaId === ABA_RESUMO || CATEGORIAS.some((categoria) => categoria.id === categoriaId);
}

function categoriaDoProduto(produto) {
  if (categoriaValida(produto.categoria)) return produto.categoria;
  if ((produto.nome || "").toLowerCase().includes("trufa")) return "trufas";
  return CATEGORIA_PADRAO;
}

function produtosDaCategoria(categoriaId = categoriaAtual) {
  if (categoriaId === ABA_RESUMO) return produtos;
  return produtos.filter((produto) => categoriaDoProduto(produto) === categoriaId);
}

function imagemDaCategoria(categoriaId = categoriaAtual) {
  return imagensPorCategoria[categoriaId] || imagensPorCategoria[CATEGORIA_PADRAO];
}

function limparImagemCategoria(categoriaId) {
  const estado = imagensPorCategoria[categoriaId];
  if (!estado) return;
  if (estado.url) URL.revokeObjectURL(estado.url);
  estado.blob = null;
  estado.url = "";
}

function limparImagensGeradas() {
  CATEGORIAS.forEach((categoria) => limparImagemCategoria(categoria.id));
}

async function iniciar() {
  aplicarConfiguracaoVisual();
  atualizarInterfaceCategoria();
  configurarEventos();
  await carregarProdutos();
}

document.addEventListener("DOMContentLoaded", iniciar);

// Recarrega os dados sempre que o app volta a aparecer na tela
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") carregarProdutos();
});
window.addEventListener("pageshow", () => carregarProdutos());

// ============================================================
// CARREGAR DADOS
// ============================================================

async function carregarProdutos() {
  try {
    const { data, error } = await db
      .from("produtos")
      .select("*")
      .order("nome", { ascending: true });

    if (error) throw error;

    produtos = data || [];
    await carregarVendas();
    limparImagensGeradas();
    renderizarProdutos();
    if (!el("resultado-imagem").classList.contains("oculto")) gerarPreviaImagem();
    esconderErro();
  } catch (erro) {
    console.error(erro);
    mostrarErro("Sem conexão. Não foi possível carregar os produtos. Toque para tentar de novo.");
  } finally {
    carregando.classList.add("oculto");
  }
}

async function carregarVendas() {
  try {
    const { data, error } = await db
      .from("movimentacoes")
      .select("id, produto_id, quantidade, preco_unitario, criado_em")
      .eq("tipo", "venda")
      .gte("criado_em", VENDAS_CONTAR_A_PARTIR_DE);

    if (error) throw error;
    vendas = data || [];
  } catch (erro) {
    console.error("Não foi possível carregar o resumo de vendas.", erro);
    vendas = [];
  }
}

// ============================================================
// RENDERIZAÇÃO — LISTA DE PRODUTOS
// ============================================================

function ordenarProdutos(lista) {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function formatarQuantidadeVendida(total) {
  return `${total} un.`;
}

function resumoVendasDaCategoria(categoriaId = categoriaAtual) {
  const produtosPorId = new Map(produtos.map((produto) => [produto.id, produto]));
  const idsCategoria = new Set(produtosDaCategoria(categoriaId).map((produto) => produto.id));

  return vendas.reduce((resumo, venda) => {
    if (!idsCategoria.has(venda.produto_id)) return resumo;

    const produto = produtosPorId.get(venda.produto_id);
    const quantidadeVendida = Math.abs(parseInt(venda.quantidade, 10) || 0);
    const precoVenda = venda.preco_unitario != null
      ? Number(venda.preco_unitario)
      : Number(produto?.preco || 0);

    resumo.quantidade += quantidadeVendida;
    resumo.valor += quantidadeVendida * (Number.isFinite(precoVenda) ? precoVenda : 0);
    return resumo;
  }, { quantidade: 0, valor: 0 });
}

function resumoVendasDoProduto(produto) {
  return vendas.reduce((resumo, venda) => {
    if (venda.produto_id !== produto.id) return resumo;

    const quantidadeVendida = Math.abs(parseInt(venda.quantidade, 10) || 0);
    const precoVenda = venda.preco_unitario != null
      ? Number(venda.preco_unitario)
      : Number(produto.preco || 0);

    resumo.quantidade += quantidadeVendida;
    resumo.valor += quantidadeVendida * (Number.isFinite(precoVenda) ? precoVenda : 0);
    return resumo;
  }, { quantidade: 0, valor: 0 });
}

function resumosVendasPorSabor(categoriaId) {
  return ordenarProdutos(produtosDaCategoria(categoriaId))
    .map((produto) => ({
      nome: produto.nome,
      ...resumoVendasDoProduto(produto),
    }))
    .filter((resumo) => resumo.quantidade > 0);
}

function criarLinhaVendaSabor(resumo) {
  const linha = document.createElement("div");
  linha.className = "linha-venda-sabor";

  const nome = document.createElement("strong");
  nome.textContent = resumo.nome;

  const totais = document.createElement("span");
  totais.textContent = `${formatarQuantidadeVendida(resumo.quantidade)} · ${formatarMoeda(resumo.valor)}`;

  linha.appendChild(nome);
  linha.appendChild(totais);
  return linha;
}

function preencherListaVendasPorSabor(container, categoriaId) {
  container.textContent = "";
  const linhas = resumosVendasPorSabor(categoriaId);

  if (linhas.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "mensagem-vendas-vazia";
    vazio.textContent = "Nenhuma venda registrada por sabor ainda.";
    container.appendChild(vazio);
    return;
  }

  linhas.forEach((resumo) => {
    container.appendChild(criarLinhaVendaSabor(resumo));
  });
}

function atualizarResumoVendas() {
  const config = categoriaConfig();
  const resumo = resumoVendasDaCategoria();
  el("resumo-vendas-titulo").textContent = config.tituloVendas;
  el("total-quantidade-vendida").textContent = formatarQuantidadeVendida(resumo.quantidade);
  el("total-valor-vendido").textContent = formatarMoeda(resumo.valor);
  preencherListaVendasPorSabor(el("resumo-vendas-sabores"), categoriaAtual);
}

function atualizarContadoresCategorias() {
  abasCategorias.forEach((aba) => {
    const config = categoriaConfig(aba.dataset.categoria);
    if (config.id === ABA_RESUMO) {
      aba.textContent = config.nome;
      return;
    }
    const total = produtosDaCategoria(config.id).length;
    aba.textContent = total > 0 ? `${config.nome} (${total})` : config.nome;
  });
}

function renderizarPainelVendas() {
  const resumoGeral = resumoVendasDaCategoria(ABA_RESUMO);
  el("total-geral-quantidade").textContent = formatarQuantidadeVendida(resumoGeral.quantidade);
  el("total-geral-valor").textContent = formatarMoeda(resumoGeral.valor);

  const detalhes = el("painel-vendas-detalhes");
  detalhes.textContent = "";

  CATEGORIAS.forEach((categoria) => {
    const resumo = resumoVendasDaCategoria(categoria.id);
    const grupo = document.createElement("section");
    grupo.className = "grupo-vendas";

    const titulo = document.createElement("h3");
    titulo.textContent = categoria.nome;

    const total = document.createElement("p");
    total.className = "grupo-vendas-resumo";
    total.textContent = `${formatarQuantidadeVendida(resumo.quantidade)} · ${formatarMoeda(resumo.valor)}`;

    const sabores = document.createElement("div");
    sabores.className = "resumo-vendas-sabores";
    preencherListaVendasPorSabor(sabores, categoria.id);

    grupo.appendChild(titulo);
    grupo.appendChild(total);
    grupo.appendChild(sabores);
    detalhes.appendChild(grupo);
  });
}

function renderizarProdutos() {
  // Remove cards antigos, mantendo os elementos fixos (estado vazio / carregando)
  Array.from(listaProdutos.querySelectorAll(".cartao-produto")).forEach((n) => n.remove());
  atualizarContadoresCategorias();

  if (categoriaAtual === ABA_RESUMO) {
    estadoVazio.classList.add("oculto");
    renderizarPainelVendas();
    return;
  }

  const ordenados = ordenarProdutos(produtosDaCategoria());
  estadoVazio.textContent = categoriaConfig().vazioLista;
  estadoVazio.classList.toggle("oculto", ordenados.length > 0);
  atualizarResumoVendas();

  ordenados.forEach((produto) => {
    listaProdutos.appendChild(criarCardProduto(produto));
  });
}

function criarCardProduto(produto) {
  const ativo = produto.ativo !== false;

  const card = document.createElement("div");
  card.className = "cartao-produto" + (ativo ? "" : " inativo");
  card.dataset.id = produto.id;
  card.dataset.categoria = categoriaDoProduto(produto);

  // Botão com nome + preço (toca pra abrir editar: nome, quantidade, preço)
  const botaoInfo = document.createElement("button");
  botaoInfo.type = "button";
  botaoInfo.className = "cartao-produto-info";
  botaoInfo.addEventListener("click", () => abrirEdicaoProduto(produto.id));

  const nomeLinha = document.createElement("span");
  nomeLinha.className = "cartao-produto-nome";
  nomeLinha.textContent = produto.nome;
  if (!ativo) {
    const selo = document.createElement("span");
    selo.className = "selo-inativo";
    selo.textContent = "Pausado";
    nomeLinha.appendChild(selo);
  }

  const precoLinha = document.createElement("span");
  precoLinha.className = "cartao-produto-preco";
  precoLinha.textContent = produto.preco != null ? formatarMoeda(produto.preco) : "";

  botaoInfo.appendChild(nomeLinha);
  botaoInfo.appendChild(precoLinha);

  // Pausar/ativar: tira ou devolve o produto da imagem do WhatsApp, sem abrir nada
  const btnPausar = document.createElement("button");
  btnPausar.type = "button";
  btnPausar.className = "btn-pausar";
  btnPausar.setAttribute("aria-label", ativo ? "Pausar produto" : "Ativar produto");
  btnPausar.textContent = ativo ? "⏸️" : "▶️";
  btnPausar.addEventListener("click", () => alternarAtivo(produto.id, btnPausar));

  const quantidade = document.createElement("span");
  quantidade.className = "cartao-produto-quantidade";
  quantidade.textContent = String(produto.quantidade);

  const btnSaida = document.createElement("button");
  btnSaida.type = "button";
  btnSaida.className = "btn-estoque btn-saida";
  btnSaida.setAttribute("aria-label", `Registrar saída de ${produto.nome}`);
  btnSaida.textContent = "-";
  btnSaida.addEventListener("click", () => registrarMovimentacaoProduto(produto.id, "saida", btnSaida));

  const btnEntrada = document.createElement("button");
  btnEntrada.type = "button";
  btnEntrada.className = "btn-estoque btn-entrada";
  btnEntrada.setAttribute("aria-label", `Registrar entrada de ${produto.nome}`);
  btnEntrada.textContent = "+";
  btnEntrada.addEventListener("click", () => registrarMovimentacaoProduto(produto.id, "entrada", btnEntrada));

  const controlesEstoque = document.createElement("div");
  controlesEstoque.className = "cartao-produto-controles";
  controlesEstoque.appendChild(btnSaida);
  controlesEstoque.appendChild(quantidade);
  controlesEstoque.appendChild(btnEntrada);

  card.appendChild(botaoInfo);
  card.appendChild(btnPausar);
  card.appendChild(controlesEstoque);
  return card;
}

async function alternarAtivo(produtoId, botao) {
  const produto = produtos.find((p) => p.id === produtoId);
  if (!produto) return;

  const ativoAtual = produto.ativo !== false;
  const novoValor = !ativoAtual;

  botao.disabled = true;
  try {
    const { error } = await db.from("produtos").update({ ativo: novoValor }).eq("id", produtoId);
    if (error) throw error;
    produto.ativo = novoValor;
    renderizarProdutos();
    esconderErro();
  } catch (erro) {
    console.error(erro);
    mostrarErro(`Sem conexão. Não foi possível ${novoValor ? "ativar" : "pausar"} o produto, tente de novo.`);
    botao.disabled = false;
  }
}

async function registrarMovimentacaoProduto(produtoId, tipo, botao) {
  if (travaSalvar) return;

  const produto = produtos.find((p) => p.id === produtoId);
  if (!produto) return;

  const ehSaida = tipo === "saida";
  let acao = ehSaida ? "venda" : "entrada";
  let vendaParaDesfazer = null;

  if (!ehSaida) {
    vendaParaDesfazer = vendaRecenteParaDesfazer(produtoId);
    if (vendaParaDesfazer) {
      const deveDesfazer = window.confirm(
        `Esse + é para adicionar "${produto.nome}" de volta, desfazendo a venda que acabou de registrar?\n\nOK = desfazer a venda\nCancelar = repor estoque`
      );
      acao = deveDesfazer ? "desfazer" : "entrada";
    }
  }

  travaSalvar = true;
  botao.disabled = true;
  mostrarCarregando(true);

  try {
    let error = null;

    if (acao === "desfazer") {
      ({ error } = await db.rpc("desfazer_movimentacao", {
        p_movimentacao_id: vendaParaDesfazer.id,
      }));
      delete ultimasVendasPorProduto[produtoId];
    } else {
      const rpc = ehSaida ? "registrar_venda" : "registrar_entrada";
      const resposta = await db.rpc(rpc, {
        p_produto_id: produtoId,
        p_quantidade: 1,
      });
      error = resposta.error;

      if (ehSaida && resposta.data?.id) {
        ultimasVendasPorProduto[produtoId] = {
          id: resposta.data.id,
          registradaEm: Date.now(),
        };
      }

      if (!ehSaida) {
        delete ultimasVendasPorProduto[produtoId];
      }
    }

    if (error) throw error;

    esconderErro();
    await carregarProdutos();
  } catch (erro) {
    console.error(erro);
    mostrarErro(mensagemErroMovimentacao(acao));
    botao.disabled = false;
  } finally {
    travaSalvar = false;
    mostrarCarregando(false);
  }
}

function vendaRecenteParaDesfazer(produtoId) {
  const venda = ultimasVendasPorProduto[produtoId];
  if (!venda) return null;

  const aindaRecente = Date.now() - venda.registradaEm <= TEMPO_DESFAZER_VENDA_MS;
  if (!aindaRecente) {
    delete ultimasVendasPorProduto[produtoId];
    return null;
  }

  return venda;
}

function mensagemErroMovimentacao(acao) {
  if (acao === "venda") {
    return "Não foi possível registrar a saída. Confira o estoque e tente de novo.";
  }
  if (acao === "desfazer") {
    return "Não foi possível desfazer a venda. Tente de novo.";
  }
  return "Não foi possível registrar a entrada. Tente de novo.";
}

// ============================================================
// NOVO PRODUTO — formulário fixo no topo da tela (sem modal, menos toques)
// ============================================================

function erroColunaCategoria(erro) {
  return erro && (
    erro.code === "PGRST204" ||
    (erro.message || "").toLowerCase().includes("categoria")
  );
}

async function inserirProduto(payload) {
  const resposta = await db.from("produtos").insert(payload);
  if (erroColunaCategoria(resposta.error)) {
    return db.from("produtos").insert({ nome: payload.nome });
  }
  return resposta;
}

async function atualizarProduto(produtoId, payload) {
  const resposta = await db.from("produtos").update(payload).eq("id", produtoId);
  if (erroColunaCategoria(resposta.error)) {
    const { categoria, ...payloadSemCategoria } = payload;
    return db.from("produtos").update(payloadSemCategoria).eq("id", produtoId);
  }
  return resposta;
}

el("btn-salvar-novo-produto").addEventListener("click", async () => {
  if (travaSalvar) return;

  const nome = el("input-novo-nome").value.trim();

  if (!nome) {
    mostrarErroCampo("erro-novo-produto", "Digite o nome do produto.");
    return;
  }

  travaSalvar = true;
  mostrarCarregando(true);
  try {
    const { error } = await inserirProduto({ nome, categoria: categoriaAtual });
    if (error) {
      if (error.code === "23505") {
        mostrarErroCampo("erro-novo-produto", "Já existe um produto com esse nome.");
      } else {
        throw error;
      }
      return;
    }
    el("input-novo-nome").value = "";
    el("input-novo-nome").focus();
    esconderErro();
    await carregarProdutos();
  } catch (erro) {
    console.error(erro);
    mostrarErroCampo("erro-novo-produto", "Sem conexão. O produto NÃO foi salvo, tente de novo.");
  } finally {
    travaSalvar = false;
    mostrarCarregando(false);
  }
});

function converterPreco(texto) {
  if (!texto) return null;
  const normalizado = texto.replace(/\./g, "").replace(",", ".");
  const numero = parseFloat(normalizado);
  if (isNaN(numero) || numero < 0) return null;
  return Math.round(numero * 100) / 100;
}

// ============================================================
// MODAL — EDITAR / EXCLUIR PRODUTO
// ============================================================

function abrirEdicaoProduto(produtoId) {
  const produto = produtos.find((p) => p.id === produtoId);
  if (!produto) return;
  el("input-editar-id").value = produtoId;
  el("select-editar-categoria").value = categoriaDoProduto(produto);
  el("input-editar-nome").value = produto.nome;
  el("input-editar-quantidade").value = String(produto.quantidade);
  el("input-editar-preco").value = produto.preco != null ? String(produto.preco).replace(".", ",") : "";
  esconderErroCampo("erro-editar-produto");
  abrirModal("modal-editar-produto");
}

el("btn-salvar-editar-produto").addEventListener("click", async () => {
  if (travaSalvar) return;

  const produtoId = el("input-editar-id").value;
  const nome = el("input-editar-nome").value.trim();
  const categoria = el("select-editar-categoria").value;
  const quantidadeBruta = el("input-editar-quantidade").value.trim();
  const precoBruto = el("input-editar-preco").value.trim();

  if (!nome) {
    mostrarErroCampo("erro-editar-produto", "Digite o nome do produto.");
    return;
  }

  const quantidade = quantidadeBruta === "" ? 0 : parseInt(quantidadeBruta, 10);
  if (isNaN(quantidade) || quantidade < 0) {
    mostrarErroCampo("erro-editar-produto", "Digite uma quantidade válida (0 ou mais).");
    return;
  }

  const preco = converterPreco(precoBruto);
  if (precoBruto !== "" && preco === null) {
    mostrarErroCampo("erro-editar-produto", "Digite um preço válido, ex: 3,50.");
    return;
  }

  travaSalvar = true;
  mostrarCarregando(true);
  try {
    const { error } = await atualizarProduto(produtoId, { nome, categoria, quantidade, preco });
    if (error) {
      if (error.code === "23505") {
        mostrarErroCampo("erro-editar-produto", "Já existe um produto com esse nome.");
      } else {
        throw error;
      }
      return;
    }
    fecharModal("modal-editar-produto");
    esconderErro();
    await carregarProdutos();
  } catch (erro) {
    console.error(erro);
    mostrarErroCampo("erro-editar-produto", "Sem conexão. As alterações NÃO foram salvas, tente de novo.");
  } finally {
    travaSalvar = false;
    mostrarCarregando(false);
  }
});

el("btn-excluir-produto").addEventListener("click", async () => {
  if (travaSalvar) return;
  const produtoId = el("input-editar-id").value;
  const produto = produtos.find((p) => p.id === produtoId);
  if (!produto) return;

  const confirmado = window.confirm(`Excluir "${produto.nome}"? Essa ação não pode ser desfeita.`);
  if (!confirmado) return;

  travaSalvar = true;
  mostrarCarregando(true);
  try {
    const { error } = await db.from("produtos").delete().eq("id", produtoId);
    if (error) throw error;
    fecharModal("modal-editar-produto");
    esconderErro();
    await carregarProdutos();
  } catch (erro) {
    console.error(erro);
    mostrarErroCampo("erro-editar-produto", "Sem conexão. A exclusão NÃO foi feita, tente de novo.");
  } finally {
    travaSalvar = false;
    mostrarCarregando(false);
  }
});

// ============================================================
// MODAIS — abrir/fechar genérico
// ============================================================

function abrirModal(id) {
  el(id).classList.remove("oculto");
}

function fecharModal(id) {
  el(id).classList.add("oculto");
}

function configurarEventos() {
  abasCategorias.forEach((aba) => {
    aba.addEventListener("click", () => selecionarCategoria(aba.dataset.categoria));
  });

  document.querySelectorAll("[data-fechar-modal]").forEach((botao) => {
    botao.addEventListener("click", () => fecharModal(botao.dataset.fecharModal));
  });

  avisoErro.addEventListener("click", () => {
    esconderErro();
    carregarProdutos();
  });

  el("btn-gerar-imagem").addEventListener("click", gerarImagemInline);
  el("switch-mostrar-precos").addEventListener("change", (evento) => {
    mostrarPrecosImagem = evento.target.checked;
    limparImagensGeradas();
    if (!el("resultado-imagem").classList.contains("oculto")) gerarPreviaImagem();
  });

  el("btn-compartilhar").addEventListener("click", compartilharImagem);
  el("btn-baixar-imagem").addEventListener("click", baixarImagem);
}

function selecionarCategoria(categoriaId) {
  if (!categoriaValida(categoriaId) || categoriaAtual === categoriaId) return;
  categoriaAtual = categoriaId;
  atualizarInterfaceCategoria();
  renderizarProdutos();

  if (categoriaAtual === ABA_RESUMO) return;

  if (!el("resultado-imagem").classList.contains("oculto")) {
    const imagem = imagemDaCategoria();
    if (imagem.blob && imagem.url) {
      exibirImagemGerada(imagem.url);
    } else {
      gerarPreviaImagem();
    }
  }
}

function atualizarInterfaceCategoria() {
  const config = categoriaConfig();
  const resumoAtivo = categoriaAtual === ABA_RESUMO;

  abasCategorias.forEach((aba) => {
    const ativa = aba.dataset.categoria === categoriaAtual;
    aba.classList.toggle("ativa", ativa);
    aba.setAttribute("aria-pressed", ativa ? "true" : "false");
  });

  el("cartao-produto-form").classList.toggle("oculto", resumoAtivo);
  listaProdutos.classList.toggle("oculto", resumoAtivo);
  el("secao-imagem").classList.toggle("oculto", resumoAtivo);
  el("painel-vendas").classList.toggle("oculto", !resumoAtivo);

  if (resumoAtivo) {
    renderizarPainelVendas();
    return;
  }

  el("titulo-novo-produto").textContent = config.tituloNovo;
  el("input-novo-nome").placeholder = config.placeholderNovo;
  el("btn-salvar-novo-produto").textContent = config.textoSalvar;
  el("btn-gerar-imagem").textContent = config.textoGerarImagem;
  el("aviso-sem-produtos").textContent = config.vazioImagem;
  atualizarResumoVendas();
}

// ============================================================
// ERROS E CARREGAMENTO
// ============================================================

function mostrarErro(mensagem) {
  avisoErro.textContent = mensagem + " (toque para tentar de novo)";
  avisoErro.classList.remove("oculto");
}

function esconderErro() {
  avisoErro.classList.add("oculto");
}

function mostrarErroCampo(id, mensagem) {
  const elErro = el(id);
  elErro.textContent = mensagem;
  elErro.classList.remove("oculto");
}

function esconderErroCampo(id) {
  el(id).classList.add("oculto");
}

function mostrarCarregando(mostrar) {
  indicadorCarregando.classList.toggle("oculto", !mostrar);
}

// ============================================================
// IMAGEM PARA WHATSAPP — seção no fim da mesma página
// ============================================================

async function gerarImagemInline() {
  el("resultado-imagem").classList.remove("oculto");
  await gerarPreviaImagem();
  el("resultado-imagem").scrollIntoView({ behavior: "smooth", block: "start" });
}

function produtosParaImagem() {
  return produtosDaCategoria()
    .filter((p) => p.ativo !== false)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function exibirImagemGerada(url) {
  const imagem = imagemDaCategoria();
  el("aviso-sem-produtos").classList.add("oculto");
  document.getElementById("preview-container").classList.remove("oculto");
  const imgEl = el("preview-imagem");
  imgEl.src = url;
  el("btn-compartilhar").disabled = false;
  el("btn-baixar-imagem").classList.toggle("oculto", !imagem.blob || podeCompartilharArquivo(imagem.blob));
}

async function gerarPreviaImagem() {
  const lista = produtosParaImagem();
  const semProdutos = lista.length === 0;
  const imagem = imagemDaCategoria();

  el("aviso-sem-produtos").textContent = categoriaConfig().vazioImagem;
  el("aviso-sem-produtos").classList.toggle("oculto", !semProdutos);
  document.getElementById("preview-container").classList.toggle("oculto", semProdutos);
  el("btn-baixar-imagem").classList.add("oculto");
  // Desabilita o botão de enviar enquanto a imagem não está pronta, para
  // um toque impaciente não cair no "clicou e não aconteceu nada".
  el("btn-compartilhar").disabled = true;
  limparImagemCategoria(categoriaAtual);

  if (semProdutos) return;

  mostrarCarregando(true);
  try {
    const opcoes = {
      mostrarPrecos: mostrarPrecosImagem,
      recado: "",
      titulo: categoriaConfig().tituloImagem,
    };
    const blob = await desenharImagemCardapio(lista, opcoes);
    if (!blob) throw new Error("Canvas não gerou a imagem (blob vazio)");

    imagem.blob = blob;
    const url = URL.createObjectURL(blob);
    imagem.url = url;
    exibirImagemGerada(url);

    if (!podeCompartilharArquivo(blob)) {
      el("btn-baixar-imagem").classList.remove("oculto");
    }
  } catch (erro) {
    console.error(erro);
    mostrarErro("Não foi possível gerar a imagem. Tente novamente.");
  } finally {
    mostrarCarregando(false);
  }
}

function podeCompartilharArquivo(blob) {
  if (!navigator.canShare) return false;
  try {
    const arquivo = new File([blob], "cardapio.png", { type: "image/png" });
    return navigator.canShare({ files: [arquivo] });
  } catch (erro) {
    return false;
  }
}

// Chamado direto no clique, sem processamento assíncrono antes,
// para não ser bloqueado pelo Safari do iPhone.
function compartilharImagem() {
  const imagem = imagemDaCategoria();
  if (!imagem.blob) {
    mostrarErro("A imagem ainda está sendo gerada, aguarde um instante e toque de novo.");
    return;
  }

  const nomeArquivo = nomeArquivoImagem();
  const arquivo = new File([imagem.blob], nomeArquivo, { type: "image/png" });

  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    navigator.share({ files: [arquivo] }).catch((erro) => {
      if (erro && erro.name === "AbortError") return; // a pessoa cancelou o menu de compartilhar
      console.error(erro);
      mostrarErro('Não foi possível abrir o compartilhamento. Toque em "Baixar imagem" e anexe pelo WhatsApp.');
      el("btn-baixar-imagem").classList.remove("oculto");
    });
  } else {
    // Navegador sem suporte a compartilhar arquivos: baixa a imagem direto.
    baixarImagem();
    el("btn-baixar-imagem").classList.remove("oculto");
  }
}

function nomeArquivoImagem() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const dia = String(hoje.getDate()).padStart(2, "0");
  return `cardapio-${categoriaAtual}-${ano}-${mes}-${dia}.png`;
}

function baixarImagem() {
  const imagem = imagemDaCategoria();
  if (!imagem.blob) return;
  const url = URL.createObjectURL(imagem.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivoImagem();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ============================================================
// DESENHO DA IMAGEM (Canvas API)
// ============================================================

const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

async function aguardarFonte() {
  try {
    await document.fonts.load("800 40px Nunito");
    await document.fonts.load("700 32px Nunito");
    await document.fonts.load("600 28px Nunito");
    await document.fonts.ready;
  } catch (erro) {
    console.error("Fonte Nunito não carregou, usando fonte do sistema.", erro);
  }
}

function fonteDisponivel() {
  return document.fonts && Array.from(document.fonts).some((f) => f.family.includes("Nunito"));
}

function nomeFonte() {
  return fonteDisponivel() ? "Nunito" : "-apple-system, Segoe UI, Roboto, sans-serif";
}

function carregarImagemLogo() {
  return new Promise((resolve) => {
    if (!CONFIG.LOGO_ARQUIVO) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = CONFIG.LOGO_ARQUIVO;
  });
}

// Quebra um texto em até `maxLinhas` linhas que cabem em `larguraMax`
function quebrarTexto(ctx, texto, larguraMax, maxLinhas) {
  const palavras = texto.split(" ");
  const linhas = [];
  let linhaAtual = "";

  for (const palavra of palavras) {
    const tentativa = linhaAtual ? `${linhaAtual} ${palavra}` : palavra;
    if (ctx.measureText(tentativa).width <= larguraMax || !linhaAtual) {
      linhaAtual = tentativa;
    } else {
      linhas.push(linhaAtual);
      linhaAtual = palavra;
      if (linhas.length === maxLinhas - 1) break;
    }
  }
  if (linhaAtual) linhas.push(linhaAtual);

  if (linhas.length > maxLinhas) linhas.length = maxLinhas;

  // Se sobrou texto além do que coube, adiciona reticências na última linha
  const textoUsado = linhas.join(" ");
  if (textoUsado.length < texto.length) {
    let ultima = linhas[linhas.length - 1];
    while (ctx.measureText(ultima + "…").width > larguraMax && ultima.length > 1) {
      ultima = ultima.slice(0, -1);
    }
    linhas[linhas.length - 1] = ultima + "…";
  }

  return linhas;
}

function arredondarRetangulo(ctx, x, y, largura, altura, raio) {
  ctx.beginPath();
  ctx.moveTo(x + raio, y);
  ctx.arcTo(x + largura, y, x + largura, y + altura, raio);
  ctx.arcTo(x + largura, y + altura, x, y + altura, raio);
  ctx.arcTo(x, y + altura, x, y, raio);
  ctx.arcTo(x, y, x + largura, y, raio);
  ctx.closePath();
}

const EMOJI_DOCE = "🍬";

async function desenharImagemCardapio(listaProdutos, opcoes) {
  await aguardarFonte();
  const logo = await carregarImagemLogo();

  const LARGURA = 1080;
  const MARGEM = 92; // padding lateral generoso, para "respirar"
  const RAIO_CANTO_IMAGEM = 36;
  const larguraTabela = LARGURA - MARGEM * 2;
  const tamanhoFonteNome = listaProdutos.length > 20 ? 34 : 38;
  const alturaCabecalho = 90;
  const alturaLinha = listaProdutos.length > 20 ? 78 : 88;

  // Blocos do topo (mantidos como constantes para o cálculo da altura bater com o desenho real)
  const TOPO_INICIAL = 96;
  const TAMANHO_LOGO = 220;
  const BLOCO_LOGO = logo ? TAMANHO_LOGO + 30 : 0;
  const BLOCO_NOME = 78;
  const BLOCO_TITULO = 60;
  const BLOCO_DATA = 66;
  const BLOCO_DIVISORIA = 56;
  const alturaTopo = TOPO_INICIAL + BLOCO_LOGO + BLOCO_NOME + BLOCO_TITULO + BLOCO_DATA + BLOCO_DIVISORIA;

  const alturaLista = alturaCabecalho + listaProdutos.length * alturaLinha + 24;
  const alturaRecado = opcoes.recado ? 130 : 0;
  const alturaRodape = 110;
  const ALTURA = Math.max(1400, alturaTopo + alturaLista + alturaRecado + alturaRodape + MARGEM);

  // Desenha tudo num canvas "de trabalho" e só no final recorta os cantos arredondados
  const canvasTrabalho = document.createElement("canvas");
  canvasTrabalho.width = LARGURA;
  canvasTrabalho.height = ALTURA;
  const ctx = canvasTrabalho.getContext("2d");

  const fonte = nomeFonte();
  const corPrincipal = CONFIG.COR_PRINCIPAL;

  // Fundo creme suave com detalhe na cor principal no topo
  ctx.fillStyle = "#fffaf3";
  ctx.fillRect(0, 0, LARGURA, ALTURA);
  ctx.fillStyle = corClaraCanvas(corPrincipal);
  ctx.fillRect(0, 0, LARGURA, 20);

  let y = TOPO_INICIAL;

  // Logo
  if (logo) {
    const proporcao = logo.width / logo.height;
    const largura = proporcao >= 1 ? TAMANHO_LOGO : TAMANHO_LOGO * proporcao;
    const altura = proporcao >= 1 ? TAMANHO_LOGO / proporcao : TAMANHO_LOGO;
    ctx.save();
    arredondarRetangulo(ctx, LARGURA / 2 - largura / 2, y, largura, altura, 24);
    ctx.clip();
    ctx.drawImage(logo, LARGURA / 2 - largura / 2, y, largura, altura);
    ctx.restore();
    y += BLOCO_LOGO;
  }

  // Nome da doceria, com emoji de doce dos dois lados
  ctx.fillStyle = corPrincipal;
  ctx.font = `800 46px ${fonte}`;
  ctx.textAlign = "center";
  ctx.fillText(`${EMOJI_DOCE} ${CONFIG.NOME_DOCERIA} ${EMOJI_DOCE}`, LARGURA / 2, y + 40);
  y += BLOCO_NOME;

  // Título
  ctx.fillStyle = "#3a2a2a";
  ctx.font = `700 34px ${fonte}`;
  ctx.fillText(opcoes.titulo || CONFIG.TITULO_IMAGEM, LARGURA / 2, y + 34);
  y += BLOCO_TITULO;

  // Data
  const hoje = new Date();
  const diaSemana = DIAS_SEMANA[hoje.getDay()];
  const dataFormatada = `${diaSemana}, ${String(hoje.getDate()).padStart(2, "0")}/${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  ctx.fillStyle = "#8a7575";
  ctx.font = `600 26px ${fonte}`;
  ctx.fillText(dataFormatada, LARGURA / 2, y + 30);
  y += BLOCO_DATA;

  // Linha decorativa
  ctx.strokeStyle = corClaraCanvas(corPrincipal, 0.55);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(LARGURA / 2 - 60, y);
  ctx.lineTo(LARGURA / 2 + 60, y);
  ctx.stroke();
  y += BLOCO_DIVISORIA;

  // Tabela minimalista: Produto | Qtd, só com linhas finas separando
  const inicioLista = y;
  const xNome = MARGEM + 12;
  const xQtd = MARGEM + larguraTabela - 12;
  const mostrarColunaPreco = !!opcoes.mostrarPrecos;
  const xPreco = xQtd - 210;

  ctx.fillStyle = "#8a7575";
  ctx.font = `700 20px ${fonte}`;
  ctx.textAlign = "left";
  ctx.fillText("PRODUTO", xNome, inicioLista + 46);
  if (mostrarColunaPreco) {
    ctx.textAlign = "right";
    ctx.fillText("PREÇO POR", xPreco, inicioLista + 30);
    ctx.fillText("UNIDADE", xPreco, inicioLista + 56);
  }
  ctx.textAlign = "right";
  ctx.fillText("QUANTIDADE", xQtd, inicioLista + 30);
  ctx.fillText("DISPONÍVEL", xQtd, inicioLista + 56);

  ctx.strokeStyle = corClaraCanvas(corPrincipal, 0.45);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(MARGEM, inicioLista + alturaCabecalho - 8);
  ctx.lineTo(MARGEM + larguraTabela, inicioLista + alturaCabecalho - 8);
  ctx.stroke();

  for (let i = 0; i < listaProdutos.length; i++) {
    const produto = listaProdutos[i];
    const yLinha = inicioLista + alturaCabecalho + i * alturaLinha;
    const yTexto = yLinha + alturaLinha / 2 + tamanhoFonteNome * 0.35;

    if (i > 0) {
      ctx.strokeStyle = corClaraCanvas(corPrincipal, 0.88);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(MARGEM, yLinha);
      ctx.lineTo(MARGEM + larguraTabela, yLinha);
      ctx.stroke();
    }

    const quantidade = parseInt(produto.quantidade, 10) || 0;
    ctx.font = `800 ${tamanhoFonteNome}px ${fonte}`;
    ctx.textAlign = "right";
    ctx.fillStyle = quantidade <= 2 ? "#c0392b" : corPrincipal;
    const textoQtd = String(quantidade);
    ctx.fillText(textoQtd, xQtd, yTexto);
    const larguraQtd = ctx.measureText(textoQtd).width;

    ctx.textAlign = "left";
    ctx.font = `700 ${tamanhoFonteNome}px ${fonte}`;
    ctx.fillStyle = "#3a2a2a";
    let textoNome = produto.nome;
    const larguraMaxNome = (mostrarColunaPreco ? xPreco - 130 : xQtd - larguraQtd - 40) - xNome;
    while (ctx.measureText(textoNome).width > larguraMaxNome && textoNome.length > 1) {
      textoNome = textoNome.slice(0, -1);
    }
    if (textoNome.length < produto.nome.length) textoNome = textoNome.trimEnd() + "…";
    ctx.fillText(textoNome, xNome, yTexto);

    if (mostrarColunaPreco && produto.preco != null) {
      ctx.textAlign = "right";
      ctx.font = `600 ${Math.round(tamanhoFonteNome * 0.85)}px ${fonte}`;
      ctx.fillStyle = "#6b5555";
      ctx.fillText(formatarMoeda(produto.preco), xPreco, yTexto);
    }
  }

  y = inicioLista + alturaCabecalho + listaProdutos.length * alturaLinha + 16;

  // Recado
  if (opcoes.recado) {
    const larguraCaixa = LARGURA - MARGEM * 2;
    ctx.font = `600 28px ${fonte}`;
    const linhasRecado = quebrarTexto(ctx, opcoes.recado, larguraCaixa - 64, 3);
    const alturaCaixa = 48 + linhasRecado.length * 38;

    ctx.fillStyle = corClaraCanvas(corPrincipal, 0.85);
    arredondarRetangulo(ctx, MARGEM, y, larguraCaixa, alturaCaixa, 20);
    ctx.fill();

    ctx.fillStyle = "#5a3d3d";
    ctx.textAlign = "center";
    linhasRecado.forEach((linha, idx) => {
      ctx.fillText(linha, LARGURA / 2, y + 46 + idx * 38);
    });

    y += alturaCaixa + 34;
  }

  // Rodapé
  ctx.fillStyle = "#8a7575";
  ctx.font = `600 24px ${fonte}`;
  ctx.textAlign = "center";
  ctx.fillText(CONFIG.RODAPE_IMAGEM, LARGURA / 2, ALTURA - 46);

  // Recorta os cantos da imagem final, para um acabamento mais bonito
  const canvasFinal = el("canvas-imagem");
  canvasFinal.width = LARGURA;
  canvasFinal.height = ALTURA;
  const ctxFinal = canvasFinal.getContext("2d");
  arredondarRetangulo(ctxFinal, 0, 0, LARGURA, ALTURA, RAIO_CANTO_IMAGEM);
  ctxFinal.clip();
  ctxFinal.drawImage(canvasTrabalho, 0, 0);

  return new Promise((resolve) => {
    canvasFinal.toBlob((blob) => resolve(blob), "image/png");
  });
}

function corClaraCanvas(hex, intensidade = 0.88) {
  const { r, g, b } = hexParaRgb(hex);
  const misturar = (canal) => Math.round(canal + (255 - canal) * intensidade);
  return `rgb(${misturar(r)}, ${misturar(g)}, ${misturar(b)})`;
}
