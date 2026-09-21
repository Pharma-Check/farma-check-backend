require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { createWorker } = require('tesseract.js');

const app = express();
app.use(cors());
app.use(express.json({ limit: '8mb' })); // fotos compactadas cabem tranquilamente aqui
app.use(express.static(path.join(__dirname, 'public'))); // serve a interface em public/index.html

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ===== MOTOR DE REGRAS (Portaria 344/98, RDC 20/2011, RDC 973/2025) =====
const REGRAS = {
  A1: { nome: 'Entorpecentes (Lista A1)', receita: 'Notificação de Receita A (amarela)', vias: 1, validadeDias: 30, retencao: true },
  A2: { nome: 'Entorpecentes (Lista A2)', receita: 'Notificação de Receita A (amarela)', vias: 1, validadeDias: 30, retencao: true },
  A3: { nome: 'Psicotrópicos (Lista A3)', receita: 'Notificação de Receita A (amarela)', vias: 1, validadeDias: 30, retencao: true },
  B1: { nome: 'Psicotrópicos (Lista B1)', receita: 'Notificação de Receita B (azul)', vias: 1, validadeDias: 30, retencao: true },
  B2: { nome: 'Psicotrópicos anorexígenos (Lista B2)', receita: 'Notificação de Receita B (azul)', vias: 1, validadeDias: 30, retencao: true },
  C1: { nome: 'Controle especial (Lista C1)', receita: 'Receita de Controle Especial (branca, 2 vias)', vias: 2, validadeDias: 30, retencao: true },
  C5: { nome: 'Anabolizantes (Lista C5)', receita: 'Receita de Controle Especial (branca, 2 vias)', vias: 2, validadeDias: 30, retencao: true },
  ANTIMICROBIANO: { nome: 'Antimicrobianos (RDC 20/2011)', receita: 'Receita comum (2 vias, com retenção)', vias: 2, validadeDias: 10, retencao: true },
  GLP1: { nome: 'Agonistas GLP-1 (RDC 973/2025)', receita: 'Receita comum (2 vias, com retenção)', vias: 2, validadeDias: 90, retencao: true },
};

function diasEntre(dataInicial, dataFinal) {
  return Math.floor((dataFinal - dataInicial) / (1000 * 60 * 60 * 24));
}

function conferirDispensacao({ regra, dataPrescricao, viasApresentadas, receitaRetida }) {
  const problemas = [];
  const hoje = new Date();
  const dataPresc = new Date(dataPrescricao);

  if (isNaN(dataPresc.getTime())) {
    problemas.push('Data de prescrição inválida.');
  } else {
    const diasDecorridos = diasEntre(dataPresc, hoje);
    if (diasDecorridos < 0) {
      problemas.push('Data de prescrição é posterior à data de hoje.');
    } else if (diasDecorridos > regra.validadeDias) {
      problemas.push(`Receita vencida: emitida há ${diasDecorridos} dias (prazo máximo: ${regra.validadeDias} dias).`);
    }
  }

  if (Number(viasApresentadas) < regra.vias) {
    problemas.push(`Número de vias insuficiente: apresentadas ${viasApresentadas}, exigidas ${regra.vias}.`);
  }

  if (regra.retencao && receitaRetida !== true) {
    problemas.push('Retenção da receita é obrigatória e não foi confirmada.');
  }

  return problemas;
}

app.post('/api/conferir', async (req, res) => {
  try {
    const { nome_medicamento, data_prescricao, vias_apresentadas, receita_retida } = req.body;

    if (!nome_medicamento || !data_prescricao || vias_apresentadas === undefined) {
      return res.status(400).json({ erro: 'Campos obrigatórios: nome_medicamento, data_prescricao, vias_apresentadas.' });
    }

    const { data: medicamentos, error } = await supabase
      .from('medicamentos_controlados')
      .select('*');

    if (error) throw error;

    const buscaNormalizada = normalizar(nome_medicamento);
    let medicamento = medicamentos.find(m => normalizar(m.nome_medicamento) === buscaNormalizada);
    if (!medicamento) {
      medicamento = medicamentos.find(m => {
        const nomeNorm = normalizar(m.nome_medicamento);
        const principioNorm = m.principio_ativo ? normalizar(m.principio_ativo) : '';
        return nomeNorm.includes(buscaNormalizada) || buscaNormalizada.includes(nomeNorm) ||
          (principioNorm && (principioNorm.includes(buscaNormalizada) || buscaNormalizada.includes(principioNorm)));
      });
    }

    if (!medicamento) {
      return res.json({
        medicamento: nome_medicamento,
        alerta: '🔴 CONFERÊNCIA OBRIGATÓRIA',
        motivos: ['Medicamento não encontrado na base. Verificar manualmente se é sujeito a controle especial.'],
      });
    }

    const regra = REGRAS[medicamento.lista];

    if (!regra) {
      return res.json({
        medicamento: medicamento.nome_medicamento,
        lista: medicamento.lista,
        alerta: '🔴 CONFERÊNCIA OBRIGATÓRIA',
        motivos: [`Lista "${medicamento.lista}" não reconhecida pelo motor de regras.`],
      });
    }

    const problemas = conferirDispensacao({
      regra,
      dataPrescricao: data_prescricao,
      viasApresentadas: vias_apresentadas,
      receitaRetida: receita_retida,
    });

    res.json({
      medicamento: medicamento.nome_medicamento,
      lista: medicamento.lista,
      regra: regra.nome,
      tipo_receita: regra.receita,
      alerta: problemas.length > 0 ? '🔴 CONFERÊNCIA OBRIGATÓRIA' : '✅ CONFORME',
      motivos: problemas,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno ao processar a conferência.' });
  }
});

// ===== OCR DA FOTO DA RECEITA =====
let workerPromise = null;
function getWorker() {
  if (!workerPromise) workerPromise = createWorker('por');
  return workerPromise;
}

function normalizar(txt) {
  return txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function extrairCategoria(textoNormalizado) {
  const match = textoNormalizado.match(/\b(A1|A2|A3|B1|B2|C1|C5)\b/);
  return match ? match[1] : null;
}

const MESES = {
  janeiro: '01', fevereiro: '02', março: '03', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
};

function extrairData(texto) {
  // 1) Prioriza um campo "Data:" isolado (não "Data de Nascimento:")
  let m = texto.match(/\bData\s*:\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // 2) Data por extenso (ex.: "04 de Maio de 2026", geralmente a data de assinatura)
  m = texto.match(/(\d{1,2})\s*de\s*([a-zçãéô]+)\s*de\s*(\d{2,4})/i);
  if (m) {
    const mesNome = m[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mesNum = MESES[mesNome] || MESES[m[2].toLowerCase()];
    if (mesNum) {
      let y = m[3];
      if (y.length === 2) y = '20' + y;
      return `${y}-${mesNum}-${m[1].padStart(2, '0')}`;
    }
  }

  // 3) Último recurso: qualquer data dd/mm/aaaa no texto
  m = texto.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  d = d.padStart(2, '0');
  mo = mo.padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function extrairCampo(texto, rotulos) {
  for (const rotulo of rotulos) {
    const re = new RegExp(rotulo + '\\s*:?\\s*(?:\\d+\\s*[-–]\\s*)?([^\\n]+)', 'i');
    const m = texto.match(re);
    if (m && m[1].trim()) return m[1].trim().slice(0, 120);
  }
  return null;
}

app.post('/api/ocr-receita', async (req, res) => {
  try {
    const { imagem_base64 } = req.body;
    if (!imagem_base64) return res.status(400).json({ erro: 'Campo imagem_base64 é obrigatório.' });

    const base64Limpo = imagem_base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Limpo, 'base64');

    const worker = await getWorker();
    const { data: { text } } = await worker.recognize(buffer);

    const textoNormalizado = normalizar(text);

    const { data: medicamentos, error } = await supabase
      .from('medicamentos_controlados')
      .select('*');
    if (error) throw error;

    let medicamentoEncontrado = null;
    for (const med of medicamentos) {
      const nomeNormalizado = normalizar(med.nome_medicamento);
      const principioNormalizado = med.principio_ativo ? normalizar(med.principio_ativo) : '';
      if (
        (nomeNormalizado && textoNormalizado.includes(nomeNormalizado)) ||
        (principioNormalizado && textoNormalizado.includes(principioNormalizado))
      ) {
        medicamentoEncontrado = med;
        break;
      }
    }

    const categoriaLida = extrairCategoria(textoNormalizado);
    const dataLida = extrairData(text);
    const pacienteLido = extrairCampo(text, ['Paciente', 'Nome do Paciente', 'Nome Completo']);
    const enderecoLido = extrairCampo(text, ['Endereço', 'Endereco']);

    res.json({
      medicamento_sugerido: medicamentoEncontrado ? medicamentoEncontrado.nome_medicamento : null,
      lista_sugerida: medicamentoEncontrado ? medicamentoEncontrado.lista : categoriaLida,
      data_sugerida: dataLida,
      paciente_sugerido: pacienteLido,
      endereco_sugerido: enderecoLido,
      texto_bruto: text.slice(0, 1500),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao processar a leitura da imagem.' });
  }
});

app.get('/status', (req, res) => res.send('Servidor de conferência de medicamentos controlados no ar.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
