<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { io } from 'socket.io-client'

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'
const conectado = ref(false)
const socketConectado = ref(false)
const mensagemOpc = ref('Aguardando comunicação com o backend.')
const ultimaAtualizacao = ref(null)
const erroConexao = ref('')
const producao = reactive({
  contPecasVermelhas: 0,
  contPecasVerdes: 0,
  contPecasAmarelas: 0,
  contPecasTotal: 0,
  estado: null
})

let socket

const conectadoAoPlc = computed(() => socketConectado.value && conectado.value)

const indicadores = computed(() => [
  { label: 'Peças vermelhas', value: producao.contPecasVermelhas, color: 'red', icon: '●' },
  { label: 'Peças verdes', value: producao.contPecasVerdes, color: 'green', icon: '●' },
  { label: 'Peças amarelas', value: producao.contPecasAmarelas, color: 'yellow', icon: '●' },
  { label: 'Total produzido', value: producao.contPecasTotal, color: 'blue', icon: 'Σ' }
])

function atualizarDados(novosDados = {}) {
  Object.keys(producao).filter((chave) => chave !== 'estado').forEach((chave) => {
    const valor = Number(novosDados[chave])
    producao[chave] = Number.isFinite(valor) ? valor : 0
  })
  const estado = Number(novosDados.estado)
  producao.estado = novosDados.estado != null && Number.isFinite(estado) ? estado : null
  ultimaAtualizacao.value = new Date()
}

function formatarHora(data) {
  return data ? data.toLocaleTimeString('pt-BR') : '--:--:--'
}

async function carregarDadosIniciais() {
  try {
    const resposta = await fetch(`${backendUrl}/`)
    if (!resposta.ok) {
      throw new Error(`Backend respondeu ${resposta.status}`)
    }

    const estado = await resposta.json()
    atualizarDados(estado.producao)
    conectado.value = estado.opcUa === 'Conectado'
    mensagemOpc.value = estado.status || mensagemOpc.value
    erroConexao.value = ''
  } catch (erro) {
    erroConexao.value = 'Não foi possível carregar os dados do backend.'
    console.error('Falha ao carregar dados iniciais:', erro)
  }
}

onMounted(() => {
  socket = io(backendUrl, { reconnection: true })
  socket.on('connect', () => {
    socketConectado.value = true
    erroConexao.value = ''
    carregarDadosIniciais()
  })
  socket.on('disconnect', () => {
    socketConectado.value = false
  })
  socket.on('connect_error', () => {
    erroConexao.value = 'Não foi possível conectar ao backend.'
  })
  socket.on('opcStatus', (status) => {
    conectado.value = Boolean(status)
  })
  socket.on('opcMensagem', (mensagem) => {
    mensagemOpc.value = mensagem
  })
  socket.on('dadosProducao', atualizarDados)
})

onBeforeUnmount(() => {
  socket?.disconnect()
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">N1</div>
        <div>
          <p class="eyebrow">AUTOMAÇÃO INDUSTRIAL</p>
          <h1>Supervisório da Planta</h1>
        </div>
      </div>
      <div class="connection-status" :class="{ online: conectadoAoPlc }">
        <span class="status-dot" />
        <span>{{ conectadoAoPlc ? 'CLP conectado' : 'CLP desconectado' }}</span>
      </div>
    </header>

    <section class="content">
      <div class="page-heading">
        <div>
          <p class="eyebrow">LINHA DE PRODUÇÃO</p>
          <h2>Planta N1</h2>
        </div>
        <div class="last-update">
          <span class="pulse" :class="{ active: conectadoAoPlc }" />
          Atualização: <strong>{{ formatarHora(ultimaAtualizacao) }}</strong>
        </div>
      </div>

      <p v-if="erroConexao" class="alert">{{ erroConexao }}</p>
      <p class="opc-message" :class="{ online: conectado }">{{ mensagemOpc }}</p>

      <section class="metrics-grid" aria-label="Indicadores de produção">
        <article v-for="indicador in indicadores" :key="indicador.label" class="metric-card">
          <div class="metric-icon" :class="indicador.color">{{ indicador.icon }}</div>
          <div>
            <p>{{ indicador.label }}</p>
            <strong>{{ indicador.value.toLocaleString('pt-BR') }}</strong>
          </div>
        </article>
      </section>

      <section class="machine-state" aria-label="Estado da máquina">
        <span class="eyebrow">ESTADO DA APLICAÇÃO</span>
        <strong>{{ producao.estado ?? 'Não publicado no OPC UA' }}</strong>
      </section>

      <section class="plant-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">MONITORAMENTO EM TEMPO REAL</p>
            <h3>Fluxo da linha</h3>
          </div>
          <span class="live-label" :class="{ offline: !conectadoAoPlc }">
            <span class="live-dot" /> {{ conectadoAoPlc ? 'AO VIVO' : 'SEM COMUNICAÇÃO' }}
          </span>
        </div>

        <div class="plant-map">
          <div class="machine source">
            <span class="machine-number">01</span>
            <div class="machine-symbol">▣</div>
            <strong>Alimentador</strong>
            <small>Entrada de peças</small>
          </div>
          <div class="conveyor first"><span /></div>
          <div class="machine process">
            <span class="machine-number">02</span>
            <div class="machine-symbol">⚙</div>
            <strong>Processamento</strong>
            <small>Triagem automática</small>
          </div>
          <div class="conveyor second"><span /></div>
          <div class="machine output">
            <span class="machine-number">03</span>
            <div class="machine-symbol">▤</div>
            <strong>Expedição</strong>
            <small>Saída da produção</small>
          </div>
          <div class="lane-label red-label">Vermelhas <b>{{ producao.contPecasVermelhas }}</b></div>
          <div class="lane-label green-label">Verdes <b>{{ producao.contPecasVerdes }}</b></div>
          <div class="lane-label yellow-label">Amarelas <b>{{ producao.contPecasAmarelas }}</b></div>
        </div>
      </section>

      <footer>
        <span>PLANTA N1</span>
        <span>•</span>
        <span>NODE.JS + OPC UA + VUE</span>
        <span class="footer-spacer" />
        <span>Backend: {{ backendUrl }}</span>
      </footer>
    </section>
  </main>
</template>
