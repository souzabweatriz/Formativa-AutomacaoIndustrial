require('dotenv').config()

const express = require('express')
const cors = require('cors')
const http = require('http')
const { Server } = require('socket.io')
const {
  OPCUAClient,
  MessageSecurityMode,
  SecurityPolicy,
  AttributeIds
} = require('node-opcua')

const app = express()
const servidorHttp = http.createServer(app)
const porta = Number(process.env.PORT || 3000)
const endpoint = process.env.OPC_ENDPOINT || 'opc.tcp://169.254.171.199:4840'
const uriNamespace = process.env.OPC_NAMESPACE_URI || 'http://vue'
const intervaloLeituraMs = 500
const intervaloReconexaoMs = 2000
const originsPermitidas = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_ORIGIN
].filter(Boolean)

if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
  throw new Error(`PORT inválida: ${process.env.PORT}`)
}

app.use(cors({ origin: originsPermitidas }))

const io = new Server(servidorHttp, {
  cors: {
    origin: originsPermitidas,
    methods: ['GET', 'POST']
  }
})

let conectadoOpc = false
let mensagemStatus = 'Aguardando comunicação com o S7-1500.'
let dados = {
  contPecasVermelhas: 0,
  contPecasVerdes: 0,
  contPecasAmarelas: 0,
  contPecasTotal: 0,
  estado: null
}

function atualizarStatus(conectado, mensagem) {
  conectadoOpc = conectado
  mensagemStatus = mensagem
  io.emit('opcStatus', conectadoOpc)
  io.emit('opcMensagem', mensagemStatus)
}

app.get('/', (req, res) => {
  res.json({
    backend: 'Funcionando',
    opcUa: conectadoOpc ? 'Conectado' : 'Desconectado',
    status: mensagemStatus,
    producao: dados
  })
})

io.on('connection', socket => {
  console.log('Cliente conectado ao Socket.IO')
  socket.emit('opcStatus', conectadoOpc)
  socket.emit('opcMensagem', mensagemStatus)
  socket.emit('dadosProducao', dados)

  socket.on('disconnect', () => {
    console.log('Cliente desconectado')
  })
})

function criarNodeIds(indiceNamespace) {
  return {
    contPecasVermelhas: process.env.OPC_NODE_VERMELHAS || `ns=${indiceNamespace};i=3`,
    contPecasVerdes: process.env.OPC_NODE_VERDES || `ns=${indiceNamespace};i=4`,
    contPecasAmarelas: process.env.OPC_NODE_AMARELAS || `ns=${indiceNamespace};i=5`,
    contPecasTotal: process.env.OPC_NODE_TOTAL || `ns=${indiceNamespace};i=6`,
    estado: process.env.OPC_NODE_ESTADO || null
  }
}

function validarLeitura(resultados, nodeIds) {
  const novo = { estado: null }
  const chaves = Object.keys(nodeIds).filter(chave => nodeIds[chave])

  resultados.forEach((resultado, indice) => {
    const chave = chaves[indice]
    const nodeId = nodeIds[chave]

    if (!resultado.statusCode.isGood()) {
      throw new Error(`Falha ao ler ${nodeId}: ${resultado.statusCode.name}`)
    }

    const valor = Number(resultado.value.value)
    if (!Number.isFinite(valor)) {
      throw new Error(`Valor não numérico recebido de ${nodeId}`)
    }

    novo[chave] = valor
  })

  return novo
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function executarLeituraOpc() {
  while (true) {
    const cliente = OPCUAClient.create({
      endpointMustExist: false,
      securityMode: MessageSecurityMode.None,
      securityPolicy: SecurityPolicy.None,
      connectionStrategy: {
        initialDelay: 1000,
        maxRetry: 0,
        maxDelay: 5000
      },
      requestedSessionTimeout: 60000
    })

    let sessao

    try {
      atualizarStatus(false, `Conectando ao servidor OPC UA ${endpoint}...`)
      await cliente.connect(endpoint)
      sessao = await cliente.createSession()

      const respostaNamespace = await sessao.read({
        nodeId: 'i=2255',
        attributeId: AttributeIds.Value
      })
      if (!respostaNamespace.statusCode.isGood()) {
        throw new Error(`Não foi possível ler a tabela de namespaces: ${respostaNamespace.statusCode.name}`)
      }

      const indiceNamespace = respostaNamespace.value.value.indexOf(uriNamespace)
      if (indiceNamespace < 0) {
        throw new Error(`Namespace "${uriNamespace}" não encontrado no servidor OPC UA`)
      }

      const nodeIds = criarNodeIds(indiceNamespace)
      const chavesLeitura = Object.keys(nodeIds).filter(chave => nodeIds[chave])
      const nos = chavesLeitura.map(chave => ({
        nodeId: nodeIds[chave],
        attributeId: AttributeIds.Value
      }))

      console.log('NodeIds OPC UA:', nodeIds)

      const lerDados = async () => {
        const resultados = await sessao.read(nos)
        if (resultados.length !== chavesLeitura.length) {
          throw new Error('O servidor OPC UA retornou uma quantidade inesperada de valores')
        }
        return validarLeitura(resultados, nodeIds)
      }

      dados = await lerDados()
      atualizarStatus(
        true,
        nodeIds.estado
          ? 'Comunicação OPC UA estabelecida.'
          : 'Comunicação OPC UA estabelecida; NodeId do estado da máquina ainda não configurado.'
      )
      io.emit('dadosProducao', dados)
      console.log('Comunicação OPC UA estabelecida:', dados)

      while (true) {
        const novosDados = await lerDados()
        const mudou = Object.keys(novosDados).some(chave => dados[chave] !== novosDados[chave])
        dados = novosDados
        if (mudou) {
          io.emit('dadosProducao', dados)
          console.log('Dados de produção:', dados)
        }
        await esperar(intervaloLeituraMs)
      }
    } catch (erro) {
      atualizarStatus(false, `Comunicação OPC UA perdida: ${erro.message}`)
      console.error(mensagemStatus)
    } finally {
      if (sessao) {
        try {
          await sessao.close()
        } catch (erro) {
          console.error('Erro ao encerrar sessão OPC UA:', erro.message)
        }
      }

      try {
        await cliente.disconnect()
      } catch (erro) {
        console.error('Erro ao desconectar cliente OPC UA:', erro.message)
      }
    }

    await esperar(intervaloReconexaoMs)
  }
}

servidorHttp.listen(porta, () => {
  console.log(`Backend iniciado em http://localhost:${porta}`)
  executarLeituraOpc().catch(erro => {
    console.error('Falha inesperada no loop OPC UA:', erro)
    process.exitCode = 1
  })
})
