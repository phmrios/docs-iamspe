# Relatório técnico — Ferramenta HTML para Monitorização Sérica da Vancomicina

## 1. Objetivo do projeto

O objetivo é transformar o **POP de Monitorização Sérica da Vancomicina do IAMSPE/HSPE** em uma ferramenta clínica web simples, rápida e auditável.

A ferramenta não deve funcionar como mera reprodução digital do PDF. Ela deve converter as tabelas e instruções do POP em um **motor de regras clínicas** capaz de receber os dados do paciente, executar os cálculos necessários, identificar a regra aplicável e apresentar a conduta prevista no protocolo.

O documento de origem foi criado em julho de 2012 e previa revisão em julho de 2014. Portanto, a primeira versão da ferramenta deve deixar explícito que reproduz o **“POP IAMSPE 2012”**, sem apresentar suas regras como recomendação farmacocinética contemporânea. 22\. POP Monitorizaçao serica v…

---

# 2. Conceito geral

O funcionamento pode ser representado assim:

```text
DADOS DO PACIENTE
        ↓
CÁLCULOS AUTOMÁTICOS
        ↓
IDENTIFICAÇÃO DA SITUAÇÃO CLÍNICA
        ↓
APLICAÇÃO DAS REGRAS DO POP
        ↓
CONDUTA
        ↓
PROGRAMAÇÃO DA PRÓXIMA COLETA
        ↓
RESULTADO PRONTO PARA COPIAR
```

O usuário não precisa consultar tabelas manualmente.

Por exemplo, em vez de procurar a combinação de peso e ClCr na tabela, o médico informa:

```text
Idade: 72 anos
Sexo: masculino
Peso: 76 kg
Creatinina: 1,8 mg/dL
```

A aplicação calcula o ClCr, identifica a faixa renal correspondente e mostra qual esquema o POP recomenda.

---

# 3. Tecnologia

Para a primeira versão, não há necessidade de servidor, banco de dados ou sistema de autenticação.

A aplicação pode ser composta por:

```text
index.html
style.css
app.js
```

### HTML

Responsável pela estrutura:

- campos;
- botões;
- abas;
- caixas de resultado;
- mensagens de alerta.

### CSS

Responsável pela aparência:

- organização da tela;
- responsividade;
- tipografia;
- diferenciação visual de alertas e resultados.

### JavaScript

Responsável por toda a lógica:

- cálculo de Cockcroft-Gault;
- interpretação do ClCr;
- aplicação das tabelas;
- cálculo de horários;
- validação dos dados;
- geração da conduta;
- geração do texto para copiar.

Tudo pode funcionar localmente no navegador.

---

# 4. Princípio arquitetural mais importante

As **regras clínicas não devem ficar misturadas com a interface**.

Deve existir uma separação clara entre:

```text
INTERFACE
↓
CÁLCULOS
↓
REGRAS DO POP
↓
APRESENTAÇÃO DO RESULTADO
```

Isso é importante porque o protocolo pode sofrer revisão.

Se uma regra mudar, deve ser possível alterar a regra sem reconstruir toda a aplicação.

---

# 5. Organização da ferramenta

Eu dividiria a interface principal em quatro módulos:

| Módulo       | Finalidade                                        |
| ------------ | ------------------------------------------------- |
| Dose inicial | Determinar o esquema inicial pelo POP             |
| Ajuste       | Interpretar vancocinemia e alterar o esquema      |
| Hemodiálise  | Aplicar a tabela específica para HD de alto fluxo |
| Coleta       | Determinar data e horário da próxima vancocinemia |

Esses módulos podem aparecer como abas no topo.

```text
┌──────────────────────────────────────────┐
│ VANCOMICINA — IAMSPE                    │
│ POP selecionado: IAMSPE 2012            │
├──────────────────────────────────────────┤
│ Dose inicial | Ajuste | HD | Coleta      │
├──────────────────────────────────────────┤
│                                          │
│         conteúdo do módulo               │
│                                          │
└──────────────────────────────────────────┘
```

---

# 6. Módulo de dose inicial

O POP determina o cálculo da depuração de creatinina por Cockcroft-Gault. 22\. POP Monitorizaçao serica v…

Portanto, os campos mínimos seriam:

```text
Idade
Sexo
Peso
Creatinina sérica
```

A aplicação calcula:

```text
ClCr = (140 − idade) × peso
       ───────────────────
          72 × creatinina
```

Para mulheres:

```text
ClCr × 0,85
```

Depois, o programa classifica automaticamente:

```text
ClCr > 50 mL/min
ClCr 10–50 mL/min
ClCr < 10 mL/min
```

e cruza esse resultado com:

```text
Peso 50–99 kg
Peso ≥100 kg
```

O POP vincula essas combinações ao esquema inicial e ao momento da primeira vancocinemia. 22\. POP Monitorizaçao serica v…

---

# 7. Transformação da tabela em regras

Não é recomendável criar a lógica como uma série enorme de decisões espalhadas pelo JavaScript.

A tabela deve virar uma estrutura central de regras.

Conceitualmente:

```text
REGRA 01

ClCr:
> 50

Peso:
50–99 kg

Dose:
1 g

Intervalo:
12 h

Primeira coleta:
antes da 4ª dose
```

Outra regra:

```text
REGRA 02

ClCr:
10–50

Peso:
50–99 kg

Dose:
1 g

Intervalo:
24 h

Primeira coleta:
antes da 3ª dose
```

Assim, o programa procura qual regra corresponde aos dados recebidos.

---

# 8. Estrutura interna das regras

Uma estrutura semelhante a JSON seria adequada.

Conceitualmente:

```text
{
    funcaoRenal: "10-50",
    peso: "50-99",
    doseMg: 1000,
    intervaloHoras: 24,
    coletaAntesDose: 3
}
```

Isso traz uma vantagem importante.

O código não precisa conhecer a lógica clínica em detalhes.

Ele apenas pergunta:

```text
Qual regra corresponde a:
ClCr = 37
peso = 76?
```

O conjunto de regras responde.

---

# 9. Módulo de monitorização

O POP define a vancocinemia como monitorização do **vale**, ou seja, coleta antes da próxima dose. Também determina a primeira mensuração, em condições habituais e sem insuficiência renal, antes da quarta dose. 22\. POP Monitorizaçao serica v…

A ferramenta pode solicitar:

```text
Dose atual
Intervalo
Horário da última dose
Valor da vancocinemia
Horário da coleta
```

Com esses dados, ela pode verificar se a coleta foi temporalmente compatível com um vale.

Por exemplo:

```text
Última dose: 08:00
Intervalo: 12 h
Próxima dose: 20:00
Coleta: 19:30
```

Resultado:

```text
Coleta compatível com vale.
Intervalo coleta → dose: 30 minutos.
```

Se o usuário inserir:

```text
Coleta: 21:15
```

o sistema pode mostrar:

```text
ATENÇÃO

O horário informado não corresponde a uma coleta
pré-dose conforme o POP.

Confirme o horário da coleta e da administração.
```

---

# 10. Módulo de ajuste pela vancocinemia

Esse módulo transforma as páginas 3 e 4 do protocolo em regras computacionais.

As principais categorias são:

```text
< 5 mg/L
5–14 mg/L
15–20 mg/L
21–40 mg/L
> 40 mg/L
```

O POP cruza cada faixa com o esquema atual e determina nova dose, novo intervalo e momento da próxima coleta. 22\. POP Monitorizaçao serica v…

Por exemplo:

```text
Vancocinemia: 8 mg/L
Esquema atual: 1 g 24/24 h
```

O programa procura:

```text
faixa = 5–14
esquema = 1 g 24/24
```

e retorna a regra correspondente.

---

# 11. Não calcular apenas a dose

O resultado deve apresentar toda a decisão.

Exemplo:

```text
VANCOMICINA — AJUSTE

Vancocinemia:
8,2 mg/L

Esquema atual:
1 g IV 24/24 h

Faixa do POP:
5–14 mg/L

Conduta conforme POP IAMSPE 2012:
Alterar para 1 g IV 12/12 h.

Próxima vancocinemia:
30 minutos antes da 3ª dose do novo esquema.

Fonte:
Tabela 2 — Monitorização sérica da vancomicina.
```

Isso permite conferir a decisão antes de aplicá-la.

---

# 12. Casos de vancocinemia elevada

As regras para concentrações elevadas precisam receber destaque visual.

Para 21–40 mg/L, o POP prevê suspensão a critério médico e nova avaliação, com reinício quando a concentração atingir 15–20 mg/L e alterações específicas do esquema. 22\. POP Monitorizaçao serica v…

Para valores >40 mg/L, o POP determina suspensão e reinício quando a vancocinemia estiver entre 15–20 mg/L. 22\. POP Monitorizaçao serica v…

Nesse caso, a interface poderia trocar o cartão comum por:

```text
┌──────────────────────────────────────┐
│ ALERTA                               │
│                                      │
│ Vancocinemia: 43 mg/L                │
│                                      │
│ Conforme POP:                        │
│ Suspender vancomicina.               │
│                                      │
│ Reinício condicionado à nova         │
│ vancocinemia conforme protocolo.     │
└──────────────────────────────────────┘
```

---

# 13. Módulo de hemodiálise

O POP possui lógica separada para pacientes em hemodiálise de alto fluxo.

Ele divide os pacientes em:

```text
<70 kg
70–100 kg
>100 kg
```

e associa cada faixa a doses específicas de ataque e manutenção. Também define a administração da manutenção ao final da sessão de hemodiálise. 22\. POP Monitorizaçao serica v…

Ao selecionar:

```text
Hemodiálise de alto fluxo: SIM
```

a aplicação deve desativar o algoritmo convencional e abrir o módulo específico.

Isso evita que duas tabelas diferentes sejam aplicadas simultaneamente.

---

# 14. Calculadora de horários

Esse recurso pode representar uma das maiores vantagens práticas.

Suponha:

```text
Dose atual:
1 g 12/12 h

Última dose:
03/10 às 08:00

Nova vancocinemia:
30 min antes da 4ª dose
```

A aplicação calcula:

```text
Dose 1 — 03/10 08:00
Dose 2 — 03/10 20:00
Dose 3 — 04/10 08:00
Dose 4 — 04/10 20:00
```

Então mostra:

```text
COLETA PROGRAMADA

04/10 às 19:30
```

Isso reduz o cálculo mental e torna a ferramenta mais operacional.

---

# 15. Validação dos dados

Antes de executar qualquer regra clínica, o sistema deve validar as informações.

Há dois níveis de validação.

### Validação técnica

Exemplo:

```text
Idade = texto
Creatinina = valor negativo
Peso = vazio
```

O cálculo não deve prosseguir.

### Validação clínica de plausibilidade

Exemplo:

```text
Peso: 740 kg
Creatinina: 0,03 mg/dL
Idade: 190 anos
```

A aplicação não precisa afirmar que o valor está errado.

Ela pode mostrar:

```text
Valor fora da faixa habitual.
Confirme o dado informado antes de prosseguir.
```

O usuário pode então confirmar ou corrigir.

---

# 16. Sistema de alertas

Algumas regras independem do cálculo principal.

O POP determina que doses individuais acima de 1 g devem ter tempo de infusão prolongado e que a concentração máxima da solução deve ser de 5 mg/mL. 22\. POP Monitorizaçao serica v…

Então, se o resultado for:

```text
Vancomicina 1,5 g IV
```

a própria ferramenta pode acrescentar:

```text
ATENÇÃO À ADMINISTRAÇÃO

Dose individual >1 g.

Conforme POP:
tempo de infusão prolongado.

Concentração máxima:
5 mg/mL.
```

Esse mecanismo é melhor do que exigir que o médico procure a informação em outra seção.

---

# 17. Resultado auditável

Um requisito importante seria sempre mostrar **como a ferramenta chegou ao resultado**.

Em vez de:

```text
Dose = 1 g 24/24 h
```

mostrar:

```text
ClCr calculado:
38,7 mL/min

Faixa do POP:
10–50 mL/min

Peso:
77 kg

Faixa de peso:
50–99 kg

Regra aplicada:
Tabela 1

Resultado:
1 g IV 24/24 h
```

Isso permite conferência humana.

A aplicação atua como **executor do protocolo**, não como uma “caixa-preta”.

---

# 18. Texto para evolução

Eu acrescentaria um botão:

```text
COPIAR RESULTADO
```

A ferramenta gera algo como:

```text
Vancomicina:

Peso: 77 kg.
Cr: 1,8 mg/dL.
ClCr estimado por Cockcroft-Gault: 38,7 mL/min.

Conforme POP institucional de monitorização sérica
da vancomicina, paciente enquadrado na faixa de
ClCr entre 10 e 50 mL/min e peso entre 50 e 99 kg.

Esquema correspondente: vancomicina 1 g IV 24/24 h.
Programar primeira vancocinemia antes da 3ª dose.
```

O médico pode revisar o texto antes de copiar para o prontuário.

---

# 19. Dados do paciente

Para a primeira versão, eu evitaria qualquer dado identificador.

Não há necessidade de:

```text
nome
CPF
RG
número de prontuário
data de nascimento completa
```

Para os cálculos, basta a idade.

Isso reduz bastante a complexidade relacionada a armazenamento e privacidade.

---

# 20. Histórico

Pode existir um histórico opcional no próprio navegador.

Por exemplo:

```text
ÚLTIMOS CÁLCULOS

04/10 08:34
ClCr 38,7
1 g 24/24 h

04/10 08:51
Vanco 8,2
1 g 24/24 → 1 g 12/12
```

Esse histórico poderia ficar em `localStorage`.

Não seria necessário enviar nada para servidor.

Também deveria existir:

```text
LIMPAR HISTÓRICO
```

---

# 21. Estrutura recomendada do JavaScript

Eu separaria o código conceitualmente em cinco componentes:

```text
1. patientData
   ↓
   recebe e valida os dados

2. calculations
   ↓
   Cockcroft-Gault e horários

3. protocolRules
   ↓
   contém as regras do POP

4. decisionEngine
   ↓
   identifica a regra aplicável

5. renderer
   ↓
   apresenta o resultado
```

O princípio seria:

```text
HTML
  ↓
patientData
  ↓
calculations
  ↓
decisionEngine
  ↓
protocolRules
  ↓
renderer
  ↓
HTML
```

---

# 22. Separação entre regra e código

Esse aspecto merece atenção especial.

Não fazer:

```text
SE ClCr > 50
    SE peso < 100
       mostrar 1 g 12/12
```

espalhado pelo programa inteiro.

Preferir:

```text
REGRAS DO PROTOCOLO
```

centralizadas em um único arquivo ou objeto.

Por exemplo:

```text
protocol-iamspe-2012.js
```

Futuramente poderia existir:

```text
protocol-iamspe-revisado.js
```

Então o restante da aplicação continuaria praticamente igual.

---

# 23. Versionamento do protocolo

A ferramenta deveria sempre apresentar algo semelhante a:

```text
PROTOCOLO ATIVO
IAMSPE — Monitorização Sérica da Vancomicina
Versão do documento: julho/2012
```

Isso é especialmente importante porque o documento possui data de criação e revisão prevista explícitas. 22\. POP Monitorizaçao serica v…

Uma versão futura poderia admitir:

```text
Protocolo:
[ IAMSPE 2012 ▼ ]
```

e outros algoritmos poderiam ser adicionados sem substituir o original.

---

# 24. Testes

Antes de qualquer uso clínico, cada combinação das tabelas deve possuir um teste conhecido.

Exemplo:

```text
TESTE

Peso:
75 kg

ClCr:
60 mL/min

RESULTADO ESPERADO:
1 g 12/12 h
Primeira coleta antes da 4ª dose

RESULTADO DO SISTEMA:
1 g 12/12 h
Primeira coleta antes da 4ª dose

STATUS:
APROVADO
```

O mesmo deve ocorrer para **todas as linhas das tabelas**, inclusive:

```text
ClCr <10
Vancocinemia <5
Vancocinemia 5–14
Vancocinemia 15–20
Vancocinemia 21–40
Vancocinemia >40
Hemodiálise
```

Cada regra do PDF precisa de pelo menos um caso de teste.

---

# 25. Conferência contra o documento original

Uma boa metodologia de desenvolvimento seria criar uma matriz de rastreabilidade:

| Regra           | Origem   | Implementada | Testada |
| --------------- | -------- | -----------: | ------: |
| Cockcroft-Gault | Página 1 |          Sim |     Sim |
| Dose inicial    | Tabela 1 |          Sim |     Sim |
| Monitorização   | Página 2 |          Sim |     Sim |
| Ajuste <5       | Tabela 2 |          Sim |     Sim |
| Ajuste 5–14     | Tabela 2 |          Sim |     Sim |
| 15–20           | Tabela 2 |          Sim |     Sim |
| 21–40           | Página 4 |          Sim |     Sim |
| >40             | Página 4 |          Sim |     Sim |
| Hemodiálise     | Página 4 |          Sim |     Sim |

Assim, fica fácil provar que nenhuma regra do protocolo foi esquecida.

---

# 26. Escopo da primeira versão

Eu manteria o MVP pequeno.

```text
V1

✓ Cockcroft-Gault
✓ Dose inicial
✓ Ajuste por vancocinemia
✓ Hemodiálise
✓ Horário da próxima coleta
✓ Alertas do POP
✓ Copiar resultado
✓ Validação de dados
```

Eu não colocaria inicialmente:

```text
login
cadastro de pacientes
banco de dados
integração com prontuário
backend
dashboard
gráficos
controle de usuários
```

Esses recursos aumentariam muito a complexidade sem melhorar o objetivo principal.

---

# 27. Resultado esperado

Ao final, a ferramenta deveria cumprir este princípio:

> **O médico informa os dados que já possui; o sistema executa automaticamente os cálculos e as tabelas do POP, mostra a regra aplicada e entrega a conduta de forma verificável.**

O projeto, portanto, não é simplesmente uma **“calculadora de vancomicina”**.

É uma implementação digital estruturada do protocolo:

```text
POP EM PDF
     ↓
REGRAS ESTRUTURADAS
     ↓
MOTOR DE DECISÃO
     ↓
INTERFACE CLÍNICA
```

Essa arquitetura também deixa o sistema preparado para uma etapa posterior: manter o **POP histórico do IAMSPE** disponível e adicionar, como protocolo separado, uma versão institucional revisada ou um modelo baseado em AUC, sem misturar as regras entre si.
