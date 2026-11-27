# Supervisório de Automação Industrial

Aplicação web para acompanhar contadores de produção de um CLP Siemens S7-1500. O backend em Node.js lê as variáveis do servidor OPC UA do CLP e envia atualizações ao painel Vue por Socket.IO.

> **Importante:** este repositório contém o supervisório, não o projeto do CLP. Não há arquivo de projeto do TIA Portal (`.ap*`) aqui; para comunicar com o equipamento, você precisa do projeto do CLP e de um S7-1500 com o servidor OPC UA configurado e acessível.

## Como os componentes se comunicam

```text
CLP S7-1500 (servidor OPC UA)
        ↓ OPC UA
Backend Node.js (porta 3000)
        ↓ Socket.IO
Painel Vue/Vite (porta 5173)
```

O painel exibe as contagens de peças vermelhas, verdes, amarelas e o total. O estado da máquina só aparece quando uma variável de estado tiver sido publicada no OPC UA e seu NodeId estiver configurado.

## Requisitos

- Windows 10/11
- Node.js 18 ou superior e npm
- Navegador moderno
- TIA Portal compatível com a CPU instalada, caso precise configurar ou carregar o programa do CLP
- CLP S7-1500 com servidor OPC UA habilitado, ou outro servidor OPC UA compatível
- Conectividade de rede entre o computador e o CLP

Confira se Node.js e npm estão instalados:

```powershell
node --version
npm --version
```

## 1. Preparar o CLP no TIA Portal

Os nomes dos menus podem variar conforme a versão do TIA Portal, a CPU e o firmware. Faça a configuração conforme o modelo instalado e as opções disponíveis no projeto:

1. Abra no TIA Portal o projeto do CLP que será usado. Este repositório não inclui esse arquivo.
2. Na configuração da CPU S7-1500, habilite o servidor OPC UA e configure a porta do endpoint. A porta padrão costuma ser `4840`; confirme o valor definido no equipamento.
3. Configure uma interface de servidor OPC UA e publique nela as variáveis que o supervisório deve ler: os quatro contadores e, se necessário, o estado da máquina. Confirme que o programa do CLP atualiza esses valores.
4. Configure as permissões e a política de segurança do servidor conforme a política da sua rede. O backend deste projeto conecta sem modo de segurança e sem usuário/senha; portanto, o endpoint precisa aceitar esse tipo de conexão. Não exponha esse endpoint a redes não confiáveis.
5. Compile e carregue a configuração/programa para a CPU. Coloque o CLP em operação e confirme que o servidor OPC UA está ativo.
6. Anote o endpoint completo do servidor, por exemplo `opc.tcp://192.168.0.10:4840`.
7. Use um navegador OPC UA para conferir o URI do namespace e o NodeId de cada variável publicada. O URI precisa coincidir exatamente com `OPC_NAMESPACE_URI`; os NodeIds precisam ser os reais do seu servidor.

O exemplo de configuração deste projeto usa o namespace URI `http://vue` e os NodeIds `ns=4;i=3` até `ns=4;i=6` para os contadores. Esses valores só funcionam se corresponderem ao que o servidor OPC UA realmente publica. O índice de namespace (como `4`) pode mudar entre servidores ou configurações; confirme todos os NodeIds e ajuste o arquivo `.env` se necessário.

## 2. Instalar e configurar o projeto

Abra o PowerShell na pasta deste repositório. Instale as dependências do frontend:

```powershell
npm install
```

Instale as dependências do backend:

```powershell
Set-Location .\backend
npm install
Set-Location ..
```

Crie o arquivo de configuração local do backend copiando o exemplo:

```powershell
Copy-Item .\backend\.env.example .\backend\.env
```

Edite `backend\.env` e ajuste os valores conforme o seu CLP:

```env
PORT=3000
OPC_ENDPOINT=opc.tcp://192.168.0.10:4840
OPC_NAMESPACE_URI=http://vue
OPC_NODE_VERMELHAS=ns=4;i=3
OPC_NODE_VERDES=ns=4;i=4
OPC_NODE_AMARELAS=ns=4;i=5
OPC_NODE_TOTAL=ns=4;i=6
OPC_NODE_ESTADO=
```

- `OPC_ENDPOINT`: endereço e porta do servidor OPC UA do CLP.
- `OPC_NAMESPACE_URI`: URI exato do namespace que contém as variáveis.
- `OPC_NODE_VERMELHAS`, `OPC_NODE_VERDES`, `OPC_NODE_AMARELAS` e `OPC_NODE_TOTAL`: NodeIds dos contadores. Substitua os exemplos pelos valores confirmados no servidor.
- `OPC_NODE_ESTADO`: opcional. Preencha com o NodeId real depois de publicar a variável de estado.
- `PORT`: porta HTTP do backend; normalmente não precisa ser alterada.

O `.env` é local e não deve ser compartilhado se contiver informações da rede. Se o endpoint exigir autenticação ou uma política de segurança diferente de conexão sem segurança, o backend atual precisará ser adaptado para corresponder à configuração do CLP.

## 3. Executar o projeto

O backend e o frontend devem ficar abertos simultaneamente em **dois terminais PowerShell**.

### Terminal 1: backend e conexão com o CLP

Na pasta raiz do projeto:

```powershell
Set-Location .\backend
npm start
```

O backend ficará disponível em `http://localhost:3000`. O terminal informa o estado da comunicação OPC UA e tenta reconectar automaticamente se a conexão cair.

### Terminal 2: painel web

Na pasta raiz do projeto:

```powershell
npm run dev
```

Abra no navegador o endereço mostrado pelo Vite, normalmente:

```text
http://localhost:5173
```

Para encerrar cada processo, volte ao terminal correspondente e pressione `Ctrl+C`.

## 4. Conferir a conexão

Com o backend em execução, abra `http://localhost:3000`. A resposta deve ser um JSON com o estado OPC UA e os dados de produção. Exemplo:

```json
{
  "backend": "Funcionando",
  "opcUa": "Conectado",
  "status": "Comunicação OPC UA estabelecida.",
  "producao": {
    "contPecasVermelhas": 0,
    "contPecasVerdes": 0,
    "contPecasAmarelas": 0,
    "contPecasTotal": 0,
    "estado": null
  }
}
```

`estado: null` significa que o NodeId do estado ainda não foi configurado. Contadores iguais a zero podem ser simplesmente os valores lidos do CLP; não indicam, por si só, falha de conexão. O painel deve mostrar o CLP conectado quando o Socket.IO e a conexão OPC UA estiverem ativos.

## URL do backend no frontend

Por padrão, o frontend usa `http://localhost:3000`. Para apontar para outro computador/servidor, crie um arquivo `.env` na raiz do projeto:

```env
VITE_BACKEND_URL=http://ENDERECO_DO_BACKEND:3000
```

Substitua `ENDERECO_DO_BACKEND` pelo endereço correto e reinicie o Vite. O backend permite por padrão as origens `localhost:5173` e `127.0.0.1:5173`; para outra origem, configure `FRONTEND_ORIGIN` em `backend\.env`.

## Compilar para produção

Na raiz do projeto:

```powershell
npm run build
```

Os arquivos compilados serão gerados em `dist`. Para visualizar localmente essa compilação:

```powershell
npm run preview
```

O `preview` serve apenas o frontend compilado; o backend e o servidor OPC UA continuam precisando estar em execução para exibir dados reais.

## Solução de problemas

### Backend inicia, mas não conecta ao OPC UA

- Confirme que o CLP está ligado, em operação e acessível pela rede.
- Confira `OPC_ENDPOINT` em `backend\.env`, incluindo IP e porta.
- Confirme que o servidor OPC UA está habilitado e aceita conexão sem segurança, conforme a configuração atual do backend.
- Verifique firewall, VLAN, cabo/rede e regras de acesso à porta OPC UA.
- Consulte as mensagens exibidas no terminal do backend.

### Namespace não encontrado

- Confira se `OPC_NAMESPACE_URI` é exatamente o URI publicado pelo servidor OPC UA.
- O URI de namespace não é necessariamente o mesmo que o nome do projeto ou da interface no TIA Portal.

### Falha ao ler NodeId ou valores inválidos

- Confirme no navegador OPC UA o NodeId de cada variável.
- Atualize `OPC_NODE_VERMELHAS`, `OPC_NODE_VERDES`, `OPC_NODE_AMARELAS` e `OPC_NODE_TOTAL` em `backend\.env`.
- Confirme que as variáveis publicadas existem, estão legíveis e têm valores numéricos.
- Reinicie o backend após alterar `backend\.env`.

### Painel abre, mas não recebe dados

- Confirme que o backend está em execução e responda em `http://localhost:3000`.
- Confira se `VITE_BACKEND_URL` aponta para o backend correto; reinicie o Vite após alterá-la.
- Se estiver usando outro endereço/porta para o frontend, ajuste a origem permitida no backend.
- Verifique erros de conexão no console do navegador e nos terminais.

### Erro ao instalar dependências

Execute `npm install` novamente na raiz e, separadamente, dentro de `backend`. Se for necessário refazer a instalação, remova somente o `node_modules` da pasta que apresentou erro e execute novamente `npm install` nela.
