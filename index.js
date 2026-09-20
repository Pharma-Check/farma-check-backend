require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

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

    const { data, error } = await supabase
      .from('medicamentos_controlados')
      .select('*')
      .ilike('nome_medicamento', nome_medicamento.trim())
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.json({
        medicamento: nome_medicamento,
        alerta: '🔴 CONFERÊNCIA OBRIGATÓRIA',
        motivos: ['Medicamento não encontrado na base. Verificar manualmente se é sujeito a controle especial.'],
      });
    }

    const medicamento = data[0];
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

app.get('/', (req, res) => res.send('Servidor de conferência de medicamentos controlados no ar.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
