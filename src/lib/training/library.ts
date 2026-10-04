/**
 * Biblioteca de treino — textos ORIGINAIS escritos para o LêMais, com questionários revisados.
 * A dificuldade é uma classificação editorial aproximada, não uma medida científica.
 * As evidências são trechos literais do texto e são verificadas por teste automatizado.
 */
import type { Difficulty, TextBlock } from "@/lib/types";
import type { RawQuestion } from "@/lib/comprehension/validate";

export interface TrainingText {
  id: string;
  title: string;
  difficulty: Exclude<Difficulty, "nao_classificada">;
  summary: string;
  blocks: TextBlock[];
  questions: RawQuestion[];
}

const p = (text: string): TextBlock => ({ type: "paragraph", text });
const h = (text: string): TextBlock => ({ type: "heading", text });

export const TRAINING_TEXTS: TrainingText[] = [
  {
    id: "horta-da-escola",
    title: "A horta da escola",
    difficulty: "facil",
    summary: "Como um terreno vazio virou horta e mudou a rotina de uma escola.",
    blocks: [
      p("Atrás da quadra da Escola Municipal Rio Claro havia um terreno vazio. Durante anos, ele serviu apenas para guardar carteiras quebradas e acumular folhas secas. Ninguém passava por ali, a não ser para buscar uma bola perdida."),
      p("Tudo mudou quando a professora Lúcia propôs um desafio à turma do quinto ano: transformar aquele espaço em uma horta. Os alunos ficaram animados, mas logo perceberam que o trabalho seria grande. Primeiro, foi preciso retirar o entulho. Depois, a terra dura teve de ser revirada e misturada com adubo feito de restos de frutas da própria cozinha da escola."),
      p("As primeiras sementes foram de alface, cenoura e cheiro-verde. Cada grupo de alunos ficou responsável por um canteiro e por um caderno de anotações. Nele, as crianças registravam a data do plantio, a quantidade de água e o crescimento das plantas. Em pouco tempo, os cadernos viraram motivo de disputa: todos queriam mostrar que o seu canteiro estava mais bonito."),
      p("Nem tudo deu certo. Uma semana de chuva forte destruiu parte das mudas de cenoura, e alguns alunos ficaram desanimados. A professora aproveitou o momento para conversar sobre paciência e sobre como os agricultores enfrentam o clima todos os dias. A turma replantou os canteiros e cobriu a terra com palha para protegê-la."),
      p("Três meses depois, a primeira colheita chegou ao refeitório. A merendeira preparou uma salada com as alfaces da horta, e muitos alunos que nunca comiam verduras resolveram experimentar. Hoje, o antigo terreno vazio é o lugar preferido da escola no intervalo, e outras turmas já pediram para ter seus próprios canteiros."),
    ],
    questions: [
      {
        prompt: "Qual é a ideia central do texto?",
        options: [
          "Um terreno abandonado virou uma horta que mudou a rotina da escola.",
          "A escola precisou fechar a quadra por causa das chuvas.",
          "A merendeira criou um novo cardápio sem verduras.",
          "Os alunos aprenderam a consertar carteiras quebradas.",
        ],
        correctOption: 0,
        explanation: "O texto acompanha a transformação do terreno em horta e seus efeitos na escola.",
        evidence: "Hoje, o antigo terreno vazio é o lugar preferido da escola no intervalo",
        focus: "ideia_central",
      },
      {
        prompt: "O que os alunos registravam nos cadernos de anotações?",
        options: [
          "As notas das provas de ciências.",
          "A data do plantio, a quantidade de água e o crescimento das plantas.",
          "Receitas preparadas pela merendeira.",
          "Os nomes dos alunos que perdiam a bola.",
        ],
        correctOption: 1,
        explanation: "O texto lista exatamente esses três registros.",
        evidence: "as crianças registravam a data do plantio, a quantidade de água e o crescimento das plantas",
        focus: "desenvolvimento",
      },
      {
        prompt: "O que a turma fez depois que a chuva destruiu parte das mudas?",
        options: [
          "Desistiu da horta e voltou a usar o terreno como depósito.",
          "Comprou verduras prontas para o refeitório.",
          "Replantou os canteiros e cobriu a terra com palha.",
          "Mudou a horta para dentro da sala de aula.",
        ],
        correctOption: 2,
        explanation: "Após a conversa sobre paciência, a turma replantou e protegeu a terra.",
        evidence: "A turma replantou os canteiros e cobriu a terra com palha para protegê-la.",
        focus: "desenvolvimento",
      },
      {
        prompt: "Qual foi um efeito da primeira colheita?",
        options: [
          "A escola passou a vender verduras na feira.",
          "A professora Lúcia foi transferida para outra escola.",
          "As outras turmas foram proibidas de usar o terreno.",
          "Alunos que não comiam verduras resolveram experimentar a salada.",
        ],
        correctOption: 3,
        explanation: "O texto diz que muitos alunos que nunca comiam verduras experimentaram a salada.",
        evidence: "muitos alunos que nunca comiam verduras resolveram experimentar",
        focus: "conclusao",
      },
    ],
  },
  {
    id: "farol-cabo-manso",
    title: "O último faroleiro de Cabo Manso",
    difficulty: "facil",
    summary: "A rotina de um faroleiro e o que mudou quando o farol ficou automático.",
    blocks: [
      p("Durante quarenta anos, Seu Aurélio subiu os cento e doze degraus do farol de Cabo Manso todas as tardes. Lá em cima, limpava as lentes, conferia o mecanismo e acendia a luz que orientava os barcos de pesca na volta para casa."),
      p("O trabalho exigia atenção. Em noites de neblina, ele também tocava uma buzina a cada trinta segundos, para que os pescadores soubessem onde ficavam as pedras. Seu Aurélio dizia que conhecia cada barco pelo barulho do motor e que, por isso, nunca dormia antes de ouvir o último deles entrar no porto."),
      p("Há cinco anos, o farol foi automatizado. Hoje, um sensor acende a luz quando escurece, e uma central em outra cidade recebe um aviso se algo falhar. A mudança deixou o sistema mais barato e reduziu a necessidade de alguém morar no alto do penhasco."),
      p("Seu Aurélio, porém, não se afastou. Ele agora recebe visitantes e conta histórias sobre tempestades, resgates e barcos que quase se perderam. Para ele, a máquina faz bem o trabalho de acender a luz, mas não guarda a memória do lugar. Por isso, decidiu escrever um livro com tudo o que viu da janela do farol."),
      p("A vila apoiou a ideia. A escola local organizou uma campanha para imprimir os primeiros exemplares, e os pescadores mais antigos contribuíram com fotografias. O livro deve ser lançado no próximo verão, na festa dos navegantes."),
    ],
    questions: [
      {
        prompt: "Sobre o que o texto trata principalmente?",
        options: [
          "A construção de um novo porto em Cabo Manso.",
          "A vida de um faroleiro e a decisão de preservar a memória do farol após a automação.",
          "Uma competição entre barcos de pesca.",
          "Os perigos de subir escadas muito altas.",
        ],
        correctOption: 1,
        explanation: "O texto acompanha Seu Aurélio, a automação do farol e o livro que ele decidiu escrever.",
        evidence: "Por isso, decidiu escrever um livro com tudo o que viu da janela do farol.",
        focus: "ideia_central",
      },
      {
        prompt: "O que Seu Aurélio fazia em noites de neblina?",
        options: [
          "Apagava a luz para economizar energia.",
          "Ia de barco buscar os pescadores.",
          "Tocava uma buzina a cada trinta segundos.",
          "Ligava para a central em outra cidade.",
        ],
        correctOption: 2,
        explanation: "A buzina indicava aos pescadores onde ficavam as pedras.",
        evidence: "Em noites de neblina, ele também tocava uma buzina a cada trinta segundos",
        focus: "desenvolvimento",
      },
      {
        prompt: "Segundo o texto, o que a automação trouxe?",
        options: [
          "Um sistema mais barato e menos necessidade de alguém morar no penhasco.",
          "O fechamento definitivo do farol.",
          "Mais trabalho noturno para Seu Aurélio.",
          "A proibição de visitas ao farol.",
        ],
        correctOption: 0,
        explanation: "O texto cita custo menor e redução da necessidade de um morador no local.",
        evidence: "A mudança deixou o sistema mais barato e reduziu a necessidade de alguém morar no alto do penhasco.",
        focus: "desenvolvimento",
      },
      {
        prompt: "Como a vila participou do projeto do livro?",
        options: [
          "Proibiu a venda do livro na festa.",
          "Pediu que o farol voltasse a ser manual.",
          "Contratou um escritor de outra cidade.",
          "A escola fez campanha para imprimir e pescadores cederam fotografias.",
        ],
        correctOption: 3,
        explanation: "A escola organizou a campanha e os pescadores contribuíram com fotos.",
        evidence: "A escola local organizou uma campanha para imprimir os primeiros exemplares, e os pescadores mais antigos contribuíram com fotografias.",
        focus: "conclusao",
      },
    ],
  },
  {
    id: "ilhas-de-calor",
    title: "Por que algumas partes da cidade esquentam mais",
    difficulty: "intermediario",
    summary: "O fenômeno das ilhas de calor urbanas e as formas de reduzi-lo.",
    blocks: [
      p("Quem caminha pela cidade em um dia de verão percebe que a temperatura muda de um bairro para outro. Uma avenida larga, cercada de prédios e asfalto, pode parecer muito mais quente do que uma rua arborizada a poucas quadras dali. Essa diferença tem nome: ilha de calor urbana."),
      h("Como o calor se acumula"),
      p("O fenômeno acontece porque os materiais usados nas cidades absorvem e guardam calor. Asfalto, concreto e telhados escuros recebem a radiação do sol ao longo do dia e a devolvem lentamente ao ambiente, inclusive à noite. Por isso, em muitas regiões urbanas, a temperatura noturna demora mais a cair do que no campo."),
      p("Além disso, a falta de vegetação reduz um mecanismo natural de resfriamento. As plantas liberam vapor de água pelas folhas, processo que retira calor do ar ao redor. Quando árvores e áreas verdes são substituídas por superfícies impermeáveis, esse alívio desaparece. O calor gerado por motores, aparelhos de ar-condicionado e indústrias completa o quadro."),
      h("Quem sente mais"),
      p("Os efeitos não são distribuídos de maneira igual. Bairros com poucas árvores, casas com pouca ventilação e moradores que passam o dia ao ar livre, como trabalhadores de rua, tendem a sofrer mais. Idosos e crianças também são mais sensíveis às temperaturas elevadas, o que transforma a ilha de calor em uma questão de saúde pública, e não apenas de conforto."),
      h("O que pode ser feito"),
      p("Não existe solução única, mas algumas medidas ajudam. Plantar árvores ao longo das calçadas cria sombra e devolve umidade ao ar. Pintar telhados com cores claras faz com que reflitam mais luz e absorvam menos calor. Pisos permeáveis e jardins de chuva permitem que a água penetre no solo, em vez de escorrer rapidamente pelo asfalto."),
      p("Essas ações funcionam melhor quando planejadas em conjunto. Uma única árvore faz pouca diferença em uma avenida inteira, mas uma rede de corredores verdes pode reduzir a temperatura de um bairro. Por isso, especialistas defendem que o combate às ilhas de calor faça parte do planejamento urbano, ao lado de transporte, moradia e saneamento."),
    ],
    questions: [
      {
        prompt: "O que é uma ilha de calor urbana, segundo o texto?",
        options: [
          "Uma ilha artificial construída para refrescar a cidade.",
          "A diferença de temperatura que faz certas áreas urbanas ficarem mais quentes.",
          "Um período de seca que atinge apenas o campo.",
          "Um bairro onde o ar-condicionado é proibido.",
        ],
        correctOption: 1,
        explanation: "O texto apresenta o fenômeno como a diferença de temperatura entre áreas da cidade.",
        evidence: "Uma avenida larga, cercada de prédios e asfalto, pode parecer muito mais quente do que uma rua arborizada a poucas quadras dali.",
        focus: "ideia_central",
      },
      {
        prompt: "Por que a temperatura noturna demora a cair em muitas áreas urbanas?",
        options: [
          "Porque os materiais urbanos guardam calor e o devolvem lentamente.",
          "Porque as árvores liberam calor durante a noite.",
          "Porque o vento é mais forte nas cidades.",
          "Porque a radiação do sol aumenta à noite.",
        ],
        correctOption: 0,
        explanation: "Asfalto, concreto e telhados escuros devolvem o calor lentamente, inclusive à noite.",
        evidence: "recebem a radiação do sol ao longo do dia e a devolvem lentamente ao ambiente, inclusive à noite",
        focus: "desenvolvimento",
      },
      {
        prompt: "Por que o texto trata a ilha de calor como questão de saúde pública?",
        options: [
          "Porque ela aumenta o preço do transporte.",
          "Porque ela afeta apenas indústrias.",
          "Porque atinge mais fortemente grupos sensíveis, como idosos e crianças.",
          "Porque obriga as escolas a fechar no verão.",
        ],
        correctOption: 2,
        explanation: "O texto relaciona os efeitos desiguais e a sensibilidade de certos grupos à saúde pública.",
        evidence: "Idosos e crianças também são mais sensíveis às temperaturas elevadas",
        focus: "desenvolvimento",
      },
      {
        prompt: "Qual é o efeito de pintar telhados com cores claras?",
        options: [
          "Aumentar a umidade do ar.",
          "Permitir que a água penetre no solo.",
          "Criar sombra nas calçadas.",
          "Refletir mais luz e absorver menos calor.",
        ],
        correctOption: 3,
        explanation: "Cores claras refletem mais luz, reduzindo a absorção de calor.",
        evidence: "Pintar telhados com cores claras faz com que reflitam mais luz e absorvam menos calor.",
        focus: "desenvolvimento",
      },
      {
        prompt: "Qual é a conclusão do texto sobre o combate às ilhas de calor?",
        options: [
          "Basta plantar uma árvore em cada avenida.",
          "Ele deve fazer parte do planejamento urbano, com ações em conjunto.",
          "Não há nada que as cidades possam fazer.",
          "A solução é proibir prédios altos.",
        ],
        correctOption: 1,
        explanation: "O texto defende ações planejadas em conjunto dentro do planejamento urbano.",
        evidence: "especialistas defendem que o combate às ilhas de calor faça parte do planejamento urbano",
        focus: "conclusao",
      },
    ],
  },
  {
    id: "caderno-de-receitas",
    title: "O caderno de receitas da família",
    difficulty: "intermediario",
    summary: "Um caderno de receitas como registro de memória, mudança e identidade.",
    blocks: [
      p("Na casa de muitas famílias existe um caderno que ninguém lembra exatamente quando começou. As páginas estão amareladas, algumas manchadas de gordura, e a letra muda de tempos em tempos. Ali, entre medidas de farinha e tempos de forno, está guardado algo que vai além da cozinha: a história de quem cozinhou."),
      p("O caderno de receitas é um documento curioso porque nunca está terminado. Uma avó registra o bolo de fubá que aprendeu com a mãe; anos depois, a neta acrescenta ao lado que o bolo fica melhor com erva-doce. Um tio risca uma quantidade de açúcar e escreve outra por cima. Cada intervenção mostra que a receita não é uma regra fixa, mas uma conversa entre gerações."),
      p("Há também o que o caderno não diz. Muitas receitas antigas trazem instruções como uma xícara bem cheia ou forno quente, sem precisar quanto. Quem escrevia contava com um conhecimento que se aprendia vendo e repetindo, ao lado de alguém mais experiente. Quando essa pessoa já não está, a anotação vira um enigma, e reproduzir o prato exige tentativa e erro."),
      p("Algumas famílias transformaram esse desafio em encontro. Primos se reúnem para testar a receita do pudim da bisavó, comparando versões até chegar àquela que lembra o sabor da infância. Nesse processo, histórias esquecidas reaparecem: a festa em que o pudim desandou, o vizinho que sempre pedia a receita e nunca acertava."),
      p("Nos últimos anos, muitos cadernos foram fotografados e compartilhados em grupos de mensagens ou digitados em arquivos. A mudança facilita o acesso e protege o conteúdo contra o desgaste do papel. Ainda assim, há quem prefira manter o original em uso, com as novas manchas e anotações. Para essas pessoas, o caderno só continua vivo enquanto volta à cozinha."),
    ],
    questions: [
      {
        prompt: "Qual é a ideia central do texto?",
        options: [
          "O caderno de receitas guarda a história e a convivência de uma família.",
          "Receitas antigas devem ser seguidas sem alterações.",
          "Cozinhar bolo de fubá exige erva-doce.",
          "Cadernos de papel devem ser substituídos por arquivos digitais.",
        ],
        correctOption: 0,
        explanation: "O texto apresenta o caderno como registro que vai além da cozinha.",
        evidence: "está guardado algo que vai além da cozinha: a história de quem cozinhou",
        focus: "ideia_central",
      },
      {
        prompt: "Por que o texto diz que a receita é uma conversa entre gerações?",
        options: [
          "Porque as receitas são lidas em voz alta durante as refeições.",
          "Porque diferentes pessoas da família alteram e complementam as anotações ao longo do tempo.",
          "Porque as receitas só podem ser feitas em grupo.",
          "Porque os avós proíbem mudanças nas receitas.",
        ],
        correctOption: 1,
        explanation: "As intervenções de avó, neta e tio mostram a receita mudando com o tempo.",
        evidence: "Cada intervenção mostra que a receita não é uma regra fixa, mas uma conversa entre gerações.",
        focus: "desenvolvimento",
      },
      {
        prompt: "Por que algumas receitas antigas viram um enigma?",
        options: [
          "Porque foram escritas em outro idioma.",
          "Porque as páginas foram arrancadas do caderno.",
          "Porque dependem de um conhecimento prático que não foi escrito.",
          "Porque os ingredientes deixaram de existir.",
        ],
        correctOption: 2,
        explanation: "Instruções imprecisas dependiam de um saber aprendido na prática com alguém experiente.",
        evidence: "Quem escrevia contava com um conhecimento que se aprendia vendo e repetindo, ao lado de alguém mais experiente.",
        focus: "desenvolvimento",
      },
      {
        prompt: "Por que algumas pessoas preferem manter o caderno original em uso?",
        options: [
          "Porque os arquivos digitais não guardam fotos.",
          "Porque o papel resiste melhor ao tempo do que os arquivos.",
          "Porque é proibido compartilhar receitas em grupos.",
          "Porque, para elas, o caderno só continua vivo enquanto volta à cozinha.",
        ],
        correctOption: 3,
        explanation: "O texto encerra com essa justificativa para manter o original em uso.",
        evidence: "Para essas pessoas, o caderno só continua vivo enquanto volta à cozinha.",
        focus: "conclusao",
      },
    ],
  },
  {
    id: "confianca-em-automacao",
    title: "Quando confiar demais em sistemas automáticos",
    difficulty: "avancado",
    summary: "Um ensaio sobre complacência, vigilância e o desenho de sistemas que mantêm as pessoas atentas.",
    blocks: [
      p("Sistemas automáticos costumam ser apresentados como uma forma de eliminar o erro humano. A promessa é sedutora: se a máquina executa a tarefa repetitiva, a pessoa fica livre para se concentrar no que realmente exige julgamento. Na prática, porém, a automação não elimina a participação humana; ela a transforma, e nem sempre de maneira favorável."),
      p("O primeiro efeito é uma espécie de complacência. Quando um sistema acerta durante muito tempo, quem o supervisiona tende a verificar seus resultados com menos cuidado. A confiança, que inicialmente se baseava em evidências, passa a se apoiar no hábito. O problema surge justamente no momento raro em que o sistema falha: a pessoa que deveria perceber o erro já deixou de olhar com atenção."),
      p("Um segundo efeito, menos visível, é a perda gradual de habilidade. Tarefas que deixam de ser praticadas tornam-se mais difíceis de executar quando for preciso retomá-las. Assim, a automação pode criar uma situação paradoxal: a intervenção humana se torna necessária exatamente nas circunstâncias mais complexas, e é nelas que o operador está menos preparado para agir."),
      h("Desenhar para a atenção"),
      p("Nada disso significa que a automação seja indesejável. Significa que seu valor depende de como ela é desenhada. Sistemas que explicam o que estão fazendo, que mostram o grau de certeza de suas decisões e que pedem confirmação em momentos críticos ajudam a manter a pessoa envolvida. Já sistemas opacos, que apenas entregam resultados, incentivam a aceitação passiva."),
      p("Outra estratégia é preservar oportunidades de prática. Em vez de automatizar uma tarefa por completo, alguns projetos alternam momentos em que a máquina conduz e momentos em que a pessoa assume, justamente para que a habilidade não se perca. Esse arranjo pode parecer menos eficiente no curto prazo, mas reduz a fragilidade do conjunto no longo prazo."),
      p("A questão central, portanto, não é escolher entre confiar ou desconfiar das máquinas. É calibrar a confiança: confiar na medida das evidências, revisá-la quando o contexto muda e construir sistemas que tornem essa calibragem possível. Uma automação bem desenhada não substitui o julgamento humano; ela o mantém em forma."),
    ],
    questions: [
      {
        prompt: "Qual é a tese principal do texto?",
        options: [
          "A automação deve ser abandonada porque sempre aumenta o erro humano.",
          "O valor da automação depende de um desenho que mantenha a confiança calibrada e o julgamento humano ativo.",
          "Sistemas automáticos eliminam completamente a necessidade de supervisão.",
          "Só tarefas repetitivas podem ser automatizadas com segurança.",
        ],
        correctOption: 1,
        explanation: "O texto conclui que a questão é calibrar a confiança e desenhar sistemas que preservem o julgamento.",
        evidence: "A questão central, portanto, não é escolher entre confiar ou desconfiar das máquinas. É calibrar a confiança",
        focus: "ideia_central",
      },
      {
        prompt: "Como o texto descreve a complacência?",
        options: [
          "A confiança deixa de se basear em evidências e passa a se apoiar no hábito.",
          "O operador passa a desconfiar de todos os resultados do sistema.",
          "A máquina reduz deliberadamente sua precisão.",
          "A equipe aumenta a frequência das verificações.",
        ],
        correctOption: 0,
        explanation: "Após muitos acertos, a verificação diminui e a confiança vira hábito.",
        evidence: "A confiança, que inicialmente se baseava em evidências, passa a se apoiar no hábito.",
        focus: "desenvolvimento",
      },
      {
        prompt: "Qual é a situação paradoxal mencionada no texto?",
        options: [
          "A máquina fica mais lenta quanto mais é usada.",
          "Sistemas transparentes geram mais erros que os opacos.",
          "A intervenção humana é exigida nos casos mais complexos, quando o operador está menos preparado.",
          "A automação aumenta o número de tarefas repetitivas.",
        ],
        correctOption: 2,
        explanation: "A perda de habilidade coincide com a necessidade de agir em situações difíceis.",
        evidence: "a intervenção humana se torna necessária exatamente nas circunstâncias mais complexas, e é nelas que o operador está menos preparado para agir",
        focus: "desenvolvimento",
      },
      {
        prompt: "Qual característica, segundo o texto, incentiva a aceitação passiva?",
        options: [
          "Pedir confirmação em momentos críticos.",
          "Mostrar o grau de certeza das decisões.",
          "Alternar momentos de condução entre máquina e pessoa.",
          "Ser um sistema opaco que apenas entrega resultados.",
        ],
        correctOption: 3,
        explanation: "Sistemas opacos são apontados como incentivo à aceitação passiva.",
        evidence: "Já sistemas opacos, que apenas entregam resultados, incentivam a aceitação passiva.",
        focus: "desenvolvimento",
      },
      {
        prompt: "Por que alguns projetos alternam o controle entre máquina e pessoa?",
        options: [
          "Para que a habilidade humana não se perca, mesmo com menor eficiência imediata.",
          "Para reduzir o custo de manutenção dos equipamentos.",
          "Porque a máquina não consegue operar sozinha.",
          "Para eliminar a necessidade de explicações do sistema.",
        ],
        correctOption: 0,
        explanation: "O arranjo preserva a prática e reduz a fragilidade no longo prazo.",
        evidence: "justamente para que a habilidade não se perca",
        focus: "conclusao",
      },
    ],
  },
  {
    id: "mapa-e-territorio",
    title: "O mapa não é o território",
    difficulty: "avancado",
    summary: "Um ensaio sobre modelos, simplificações e o risco de confundi-los com a realidade.",
    blocks: [
      p("Todo mapa é uma escolha. Para caber em uma folha de papel ou em uma tela, ele precisa deixar coisas de fora: a inclinação exata de cada rua, o barulho de um mercado, a sombra de uma árvore às três da tarde. Essa omissão não é um defeito; é justamente o que torna o mapa útil. Um mapa que reproduzisse cada detalhe seria tão grande e confuso quanto o lugar que pretende representar."),
      p("O mesmo vale para modelos de outros tipos. Uma planilha de orçamento, um organograma ou um indicador de desempenho são mapas de realidades mais complexas. Eles simplificam para permitir decisões, comparações e conversas. O risco começa quando esquecemos que se trata de simplificações e passamos a tratá-los como se fossem o próprio território."),
      p("Esse esquecimento se manifesta de formas sutis. Uma equipe avaliada apenas pelo número de atendimentos pode reduzir o tempo de cada conversa, cumprindo a meta enquanto a qualidade cai. O indicador melhora, mas aquilo que ele deveria representar piora. Quando a medida se torna o objetivo, ela tende a perder a capacidade de informar sobre o que realmente importa."),
      h("Usar mapas sem ser usado por eles"),
      p("A saída não é abandonar os modelos, já que sem eles seria impossível coordenar qualquer esforço coletivo. A saída é usá-los com consciência de seus limites. Isso inclui perguntar o que cada mapa deixa de fora, quem decidiu o que seria representado e em que situações ele costuma falhar."),
      p("Também ajuda combinar mapas diferentes. Um número pode ser acompanhado por relatos de quem vive a situação; uma projeção pode ser confrontada com o que de fato aconteceu. Cada fonte corrige parcialmente os pontos cegos das outras, sem que nenhuma precise ser tratada como verdade completa."),
      p("Por fim, convém visitar o território de tempos em tempos. Caminhar pela rua que o mapa descreve, conversar com quem está por trás do indicador, observar o processo que a planilha resume. É nesse contato direto que descobrimos se o mapa ainda serve ou se o terreno mudou enquanto olhávamos para o papel."),
    ],
    questions: [
      {
        prompt: "Qual é a ideia central do texto?",
        options: [
          "Mapas detalhados são sempre melhores do que mapas simples.",
          "Indicadores de desempenho devem ser eliminados das empresas.",
          "Modelos são simplificações úteis, mas não devem ser confundidos com a realidade que representam.",
          "Só é possível conhecer um lugar visitando-o pessoalmente.",
        ],
        correctOption: 2,
        explanation: "O texto defende o uso de modelos com consciência de seus limites.",
        evidence: "O risco começa quando esquecemos que se trata de simplificações e passamos a tratá-los como se fossem o próprio território.",
        focus: "ideia_central",
      },
      {
        prompt: "Por que, segundo o texto, a omissão de detalhes não é um defeito do mapa?",
        options: [
          "Porque é justamente o que torna o mapa útil.",
          "Porque os detalhes omitidos não existem na realidade.",
          "Porque os mapas digitais recuperam todos os detalhes.",
          "Porque as pessoas não se interessam por detalhes.",
        ],
        correctOption: 0,
        explanation: "Um mapa com todos os detalhes seria tão confuso quanto o lugar representado.",
        evidence: "Essa omissão não é um defeito; é justamente o que torna o mapa útil.",
        focus: "desenvolvimento",
      },
      {
        prompt: "O que ilustra o exemplo da equipe avaliada pelo número de atendimentos?",
        options: [
          "Que equipes pequenas atendem melhor.",
          "Que um indicador pode melhorar enquanto aquilo que ele representa piora.",
          "Que atendimentos longos são sempre ineficientes.",
          "Que metas aumentam a qualidade do serviço.",
        ],
        correctOption: 1,
        explanation: "A meta é cumprida, mas a qualidade cai.",
        evidence: "O indicador melhora, mas aquilo que ele deveria representar piora.",
        focus: "desenvolvimento",
      },
      {
        prompt: "Qual destas práticas o texto recomenda para usar modelos melhor?",
        options: [
          "Confiar em uma única fonte considerada completa.",
          "Evitar conversar com quem está por trás dos indicadores.",
          "Substituir números por opiniões.",
          "Combinar fontes diferentes para corrigir pontos cegos.",
        ],
        correctOption: 3,
        explanation: "O texto sugere combinar mapas diferentes, cada um corrigindo parte dos pontos cegos dos outros.",
        evidence: "Cada fonte corrige parcialmente os pontos cegos das outras, sem que nenhuma precise ser tratada como verdade completa.",
        focus: "desenvolvimento",
      },
      {
        prompt: "Por que o texto recomenda visitar o território de tempos em tempos?",
        options: [
          "Para descobrir se o mapa ainda serve ou se o terreno mudou.",
          "Para desenhar mapas maiores e mais completos.",
          "Para substituir definitivamente os indicadores.",
          "Para provar que todos os modelos estão errados.",
        ],
        correctOption: 0,
        explanation: "O contato direto revela se o modelo ainda corresponde à realidade.",
        evidence: "É nesse contato direto que descobrimos se o mapa ainda serve ou se o terreno mudou enquanto olhávamos para o papel.",
        focus: "conclusao",
      },
    ],
  },
];

export function getTrainingText(id: string): TrainingText | undefined {
  return TRAINING_TEXTS.find((t) => t.id === id);
}

/** Seleciona até 3 perguntas: ideia central, desenvolvimento e conclusão. */
export function pickThree<T extends { focus?: string }>(qs: T[]): T[] {
  const central = qs.find((q) => q.focus === "ideia_central");
  const concl = [...qs].reverse().find((q) => q.focus === "conclusao");
  const dev = qs.find((q) => q.focus === "desenvolvimento");
  const picked = [central, dev, concl].filter((q): q is T => !!q);
  for (const q of qs) if (picked.length < 3 && !picked.includes(q)) picked.push(q);
  return picked.slice(0, 3);
}
