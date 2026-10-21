// Conteúdo da parte "Estratégia" do painel de gestão: o que dizem os estudos,
// as políticas recomendadas para a plataforma e a concorrência em Portugal.
// Texto fixo (não depende dos dados); os números de cada momento vêm de
// gestao-numeros.js. Fontes citadas pelo nome para o dono poder confirmar.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlinkoEstrategia = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TEMAS = [
    {
      id: 'arranque',
      titulo: 'Como se arranca um marketplace',
      resumo: 'Um site que junta clientes e profissionais só funciona quando, num sítio pequeno, há gente suficiente dos dois lados para os encontros acontecerem sozinhos. Até lá, o crescimento faz-se à mão.',
      estudos: [
        { fonte: 'Andrew Chen, "The Cold Start Problem" (livro, 2021). Foi responsável pelo crescimento da Uber e é sócio da Andreessen Horowitz.', ideia: 'Todas as redes começam por uma "rede atómica": o grupo mínimo, num sítio concreto, que já se sustenta. Na Uber foi uma cidade de cada vez. O erro mais comum é espalhar pouca gente por muitos sítios.' },
        { fonte: 'Lenny Rachitsky, estudo sobre como arrancaram os maiores marketplaces de consumo (2020).', ideia: 'A maioria começou limitada a uma cidade ou a um bairro e concentrou-se primeiro no lado mais difícil de conseguir. Muitos trouxeram os primeiros utilizadores um a um.' },
        { fonte: 'Paul Graham (Y Combinator), "Do Things That Don\'t Scale" (2013).', ideia: 'No início, as empresas que vingam fazem coisas que não escalam: angariam utilizadores à mão, ajudam cada um pessoalmente. O Airbnb chegou a ir a casa dos anfitriões tirar as fotografias.' }
      ],
      aplicado: 'Para o Flinko: escolher um distrito (onde já há mais profissionais) e 3 a 4 ofícios com procura frequente (eletricistas, canalizadores, limpeza, pintores). Pôr ali toda a energia até haver pedidos todas as semanas. Só depois passar ao distrito seguinte.',
      passos: ['Escolher o distrito e os ofícios desta fase.', 'Garantir pelo menos 3 profissionais com perfil completo por ofício nesse distrito.', 'Fazer todo o marketing de clientes só para esse distrito.', 'Passar ao distrito seguinte quando houver pelo menos 5 pedidos por semana.']
    },
    {
      id: 'marketing-local',
      titulo: 'Marketing para serviços locais',
      resumo: 'Quem precisa de um eletricista pesquisa no Google, pergunta aos vizinhos ou num grupo de Facebook. São esses os três sítios onde o Flinko tem de aparecer.',
      estudos: [
        { fonte: 'Nielsen, Global Trust in Advertising (2015, 30.000 pessoas em 60 países).', ideia: '83% confiam em recomendações de amigos e família, mais do que em qualquer anúncio. O boca a boca é o canal com mais confiança.' },
        { fonte: 'Google, orientações do Perfil da Empresa (Google Business Profile).', ideia: 'Os resultados locais (o mapa) dependem da relevância, da distância e da notoriedade. Um perfil completo, com fotos e avaliações, aparece mais.' },
        { fonte: 'BrightLocal, Local Consumer Review Survey (inquérito anual a consumidores).', ideia: 'A grande maioria das pessoas lê avaliações antes de escolher um negócio local e confia mais em quem tem avaliações recentes.' }
      ],
      aplicado: 'Para o Flinko há quatro canais, por esta ordem de custo:\n1. Profissionais a partilharem o seu link e QR (grátis e com confiança).\n2. Respostas úteis em grupos de moradores no Facebook (grátis).\n3. Administradoras de condomínio, que contratam muitos serviços (grátis, à mão).\n4. Google: perfil da empresa e, depois, anúncios pequenos por ofício e distrito.',
      passos: ['Criar o Perfil da Empresa do Flinko no Google.', '15 minutos por dia em grupos de moradores do distrito escolhido.', 'Contactar 10 administradoras de condomínio por semana.', 'Testar 5 € por dia em anúncios do Google durante 2 semanas, só para 2 ofícios, e medir.']
    },
    {
      id: 'confianca',
      titulo: 'Confiança: avaliações, verificação e fotos',
      resumo: 'Contratar alguém que não se conhece para entrar em casa é uma decisão de confiança. As provas que mais pesam são avaliações reais, o selo de verificado e fotos de trabalhos.',
      estudos: [
        { fonte: 'Spiegel Research Center, Northwestern University (2017).', ideia: 'Com 5 avaliações, a probabilidade de compra é cerca de 270% maior do que sem nenhuma. As notas entre 4,2 e 4,5 convencem mais do que um 5,0 perfeito.' },
        { fonte: 'Abrahao e outros, Stanford e Airbnb (PNAS, 2017).', ideia: 'Uma boa reputação visível faz as pessoas confiarem em desconhecidos, mesmo diferentes delas.' },
        { fonte: 'Ert, Fleischer e Magen (2016) e Zhang e outros (Management Science, 2022), com dados do Airbnb.', ideia: 'A foto de cara do anfitrião e fotos reais, de qualidade, aumentam a confiança e a procura.' }
      ],
      aplicado: 'Para o Flinko: cada profissional precisa de 3 a 5 avaliações, foto de cara e fotos de trabalhos. A verificação deve ser feita a todos. É preferível mostrar menos profissionais, todos completos, do que muitos vazios.',
      passos: ['Pedir 3 avaliações a cada profissional (texto pronto em Mensagens).', 'Verificar todos os profissionais.', 'Esconder da página inicial os perfis abaixo de 60%.', 'Mostrar as avaliações nos cartões das pesquisas.']
    },
    {
      id: 'resposta',
      titulo: 'Velocidade de resposta',
      resumo: 'Quem pede um orçamento contacta vários profissionais e fica com o primeiro que responde bem.',
      estudos: [
        { fonte: 'Oldroyd, McElheran e Elkington, Harvard Business Review (2011, 2.241 empresas).', ideia: 'Quem responde a um contacto na primeira hora tem cerca de 7 vezes mais probabilidade de o converter do que quem responde depois disso.' }
      ],
      aplicado: 'Para o Flinko: avisar o profissional no momento (notificação e email já existem), mostrar o tempo de resposta no perfil e nos cartões (já existe com 3 ou mais respostas) e lembrar quem não responde.',
      passos: ['Pedir a todos os profissionais que ativem as notificações no telemóvel.', 'Mostrar primeiro, nas pesquisas, quem responde mais depressa.', 'Falar com quem demora mais de um dia a responder.']
    },
    {
      id: 'modelo',
      titulo: 'Preços e modelo de negócio',
      resumo: 'Há três formas de um marketplace de serviços ganhar dinheiro: comissão sobre cada trabalho, pagamento por contacto ou pedido, e assinatura mensal. O Flinko escolheu a assinatura, sem comissão.',
      estudos: [
        { fonte: 'Bill Gurley (Benchmark), "A Rake Too Far" (2013).', ideia: 'Comissões altas convidam a concorrência e levam cliente e profissional a combinar por fora. Nos serviços ao domicílio, depois do primeiro trabalho o cliente fica com o contacto e a comissão é fácil de evitar.' },
        { fonte: 'Andreessen Horowitz (a16z), artigos sobre métricas de marketplaces.', ideia: 'O que mede a saúde de um marketplace é a liquidez (quem procura encontra?) e a repetição. A faturação vem depois de estas duas funcionarem.' }
      ],
      aplicado: 'Para o Flinko, "sem comissão" é uma vantagem clara contra quem cobra por pedido. Mas só se pode cobrar a assinatura quando o profissional já recebe contactos. Nesta fase, o plano grátis tem de ser bom e o pago tem de oferecer mais visibilidade e ferramentas, nunca o básico.',
      passos: ['Manter o plano grátis útil até haver procura regular.', 'Propor o plano pago só a quem já recebeu contactos (o painel mostra-os).', 'Medir quanto vale um cliente para o profissional e mostrar isso na proposta.']
    },
    {
      id: 'retencao',
      titulo: 'Fazer voltar e recomendar',
      resumo: 'O cliente que ficou contente é o melhor canal de marketing: volta da próxima vez e recomenda a outros.',
      estudos: [
        { fonte: 'Fred Reichheld, "The One Number You Need to Grow", Harvard Business Review (2003).', ideia: 'A vontade de recomendar (Net Promoter Score) é das medidas que mais acompanha o crescimento de uma empresa.' },
        { fonte: 'Nielsen, Global Trust in Advertising (2015).', ideia: 'A recomendação de alguém conhecido é a forma de publicidade em que as pessoas mais confiam.' }
      ],
      aplicado: 'Para o Flinko: depois de cada avaliação de 4 ou 5 estrelas o cliente já tem o botão "Recomendar a um amigo no WhatsApp". O passo seguinte é lembrar o cliente do Flinko da próxima vez que precisar de outro ofício.',
      passos: ['Medir quantos clientes fazem um segundo pedido.', 'Depois de um trabalho, sugerir outros ofícios ao cliente.', 'Perguntar de 3 em 3 meses: de 0 a 10, recomendarias o Flinko?']
    },
    {
      id: 'metricas',
      titulo: 'Os números que contam nesta fase',
      resumo: 'Nem todos os números servem para decidir. Nesta fase há cinco que dizem se o Flinko está a funcionar.',
      estudos: [
        { fonte: 'Andreessen Horowitz (a16z) e Andrew Chen, métricas de marketplaces.', ideia: 'Liquidez (quem procura encontra?), tempo até ao primeiro contacto, repetição, e crescimento dos dois lados em equilíbrio.' }
      ],
      aplicado: 'Os 5 números do Flinko, por ordem:\n1. Pedidos publicados por semana.\n2. Pedidos com pelo menos uma proposta (liquidez).\n3. Tempo até à primeira proposta.\n4. Profissionais com o perfil completo, por ofício e distrito.\n5. Visitantes reais por semana e de onde vêm.\nO resto é secundário até estes cinco subirem.',
      passos: ['Ver estes 5 números todas as segundas-feiras nesta página.', 'Escolher uma ação por semana para o número que estiver pior.', 'Não mudar várias coisas ao mesmo tempo: senão não se sabe o que funcionou.']
    }
  ];

  // estado: "tens" (já existe), "parcial" (existe em parte), "falta"
  var POLITICAS = [
    { titulo: 'Verificação de profissionais', estado: 'parcial', agora: 'Há selo de verificado, dado à mão no painel. Ainda há profissionais por verificar.', recomendado: 'Verificar todos antes de aparecerem em destaque. Confirmar a identidade (documento ou chamada) e, nos ofícios que o exigem, a habilitação.', porque: 'É a primeira prova de confiança para quem não conhece o profissional.' },
    { titulo: 'Avaliações', estado: 'tens', agora: 'As avaliações vêm de links enviados pelos profissionais aos clientes. Não é preciso conta para avaliar.', recomendado: 'Nunca apagar avaliações negativas, só as abusivas ou falsas. Deixar o profissional responder publicamente. Mostrar a data de cada avaliação.', porque: 'Avaliações só positivas parecem falsas. As notas entre 4,2 e 4,5 convencem mais do que 5,0 (Spiegel, 2017).' },
    { titulo: 'Tempo de resposta', estado: 'parcial', agora: 'O tempo médio aparece no perfil e nos cartões quando há 3 ou mais respostas. Há lembretes a quem não responde.', recomendado: 'Definir um objetivo público (responder em 24 horas) e dar destaque a quem o cumpre.', porque: 'Responder na primeira hora multiplica a probabilidade de fechar o trabalho (HBR, 2011).' },
    { titulo: 'Preços transparentes', estado: 'parcial', agora: 'Os serviços podem ter preço "a partir de", com unidade. Não é obrigatório.', recomendado: 'Pedir a cada profissional pelo menos um serviço com preço indicativo.', porque: 'Custos inesperados são a primeira razão para desistir (Baymard Institute).' },
    { titulo: 'Denúncias e disputas', estado: 'parcial', agora: 'Existe o formulário de contacto e de denúncia de perfis, tratado no painel antigo.', recomendado: 'Escrever as regras: o que acontece a um perfil denunciado, em quanto tempo se responde e quando se suspende uma conta.', porque: 'Regras claras protegem os clientes e os profissionais sérios, e o próprio Flinko.' },
    { titulo: 'Responsabilidade e pagamentos', estado: 'tens', agora: 'O Flinko liga as partes. O preço e o pagamento combinam-se diretamente, sem comissão. Os termos dizem-no.', recomendado: 'Lembrar o cliente, no momento de contratar, que deve combinar por escrito o preço, o prazo e o que está incluído.', porque: 'Evita desentendimentos e deixa claro o papel do Flinko.' },
    { titulo: 'Seguro e garantias', estado: 'falta', agora: 'Não há informação sobre seguros dos profissionais.', recomendado: 'Perguntar no perfil se o profissional tem seguro de responsabilidade civil e mostrar um selo a quem tem. Mais tarde, estudar uma garantia do Flinko.', porque: 'Nas obras em casa, o medo de um estrago sem resposta é uma das maiores barreiras.' },
    { titulo: 'Privacidade (RGPD)', estado: 'tens', agora: 'Há política de privacidade, de cookies e pedidos de dados no painel antigo.', recomendado: 'Manter o registo dos pedidos e responder em menos de 30 dias, como manda a lei.', porque: 'É obrigatório e dá confiança.' }
  ];

  var CONCORRENCIA = [
    { nome: 'Zaask', como: 'O cliente descreve o que precisa e recebe orçamentos. O profissional paga créditos para enviar cada proposta (segundo a informação pública do site).', forte: 'Conhecido em Portugal, muitos pedidos e muitas categorias.', fraco: 'O profissional paga sem saber se ganha o trabalho, e há queixas de pedidos de baixa qualidade.', flinko: 'Sem pagar por pedido nem comissão. O cliente vê perfis, trabalhos e preços antes de falar.' },
    { nome: 'Fixando', como: 'Também por pedidos de orçamento, com os profissionais a pagar para responder (segundo a informação pública do site).', forte: 'Presença forte no Google e muitas categorias.', fraco: 'O custo por pedido pesa aos profissionais pequenos.', flinko: 'Modelo previsível (plano grátis ou mensal) e a página de cada profissional é dele, com link próprio e QR.' },
    { nome: 'OLX (serviços)', como: 'Anúncios classificados. O profissional publica e o cliente contacta.', forte: 'Enorme audiência e é fácil publicar.', fraco: 'Sem verificação, sem avaliações fiáveis e anúncios misturados com tudo.', flinko: 'Perfis verificados, avaliações reais e só profissionais.' },
    { nome: 'Google Maps e Perfil da Empresa', como: 'O cliente pesquisa "canalizador perto de mim" e liga a quem aparece.', forte: 'É onde muita gente começa a procurar.', fraco: 'Só aparece quem tem perfil e avaliações, e os pequenos profissionais muitas vezes não têm.', flinko: 'O Flinko dá a esses profissionais uma página e avaliações que sozinhos não teriam, e deve ele próprio estar no Google.' },
    { nome: 'Boca a boca e grupos de Facebook', como: 'Pergunta-se a vizinhos e amigos.', forte: 'A maior confiança de todas.', fraco: 'Depende de conhecer alguém, não dá para comparar e não há registo.', flinko: 'Levar o boca a boca para o Flinko: os profissionais partilham o seu link e os clientes recomendam pelo WhatsApp.' }
  ];

  // Como cresceram empresas conhecidas, e o que o Flinko pode copiar.
  // Só casos públicos e muito documentados; "estado" diz se já existe no Flinko.
  var CASOS = [
    { empresa: 'Airbnb', tecnica: 'Fazer à mão o que mais pesa: fotografias', historia: 'Em 2009, em Nova Iorque, os fundadores viram que os anúncios com más fotografias não reservavam. Foram eles próprios, com uma câmara alugada, fotografar as casas dos anfitriões. As reservas desses anúncios subiram muito e o Airbnb transformou isso num programa de fotógrafos.', copiar: 'Ir pessoalmente (ou por videochamada) completar os perfis dos 10 profissionais com mais potencial: fotos de cara, fotos de trabalhos e preços. Um perfil bom vende mais do que qualquer anúncio.', estado: 'falta' },
    { empresa: 'Airbnb', tecnica: 'Ir buscar clientes onde eles já estão', historia: 'No início, o Airbnb deixou os anfitriões publicarem o anúncio também no Craigslist, o site de classificados onde as pessoas já procuravam casas, com um link de volta para o Airbnb.', copiar: 'As pessoas já pedem eletricistas e canalizadores nos grupos de Facebook e no OLX. Estar lá a responder, com o link do ofício, é o equivalente.', estado: 'parcial' },
    { empresa: 'Facebook', tecnica: 'Uma comunidade de cada vez', historia: 'Abriu só em Harvard, depois em algumas universidades, uma a uma. Só passava à seguinte quando a anterior estava cheia.', copiar: 'Um distrito de cada vez. Encher um (profissionais completos e clientes a pedir) antes de abrir o seguinte.', estado: 'falta' },
    { empresa: 'Uber', tecnica: 'Lançamento cidade a cidade, com gente local', historia: 'Cada cidade tinha uma pequena equipa local que angariava motoristas e fazia promoções em eventos. Ofereceu viagens grátis em eventos de tecnologia de São Francisco para as pessoas experimentarem.', copiar: 'Ter uma pessoa responsável pelo distrito escolhido: angaria profissionais, fala com condomínios e aparece em feiras e associações de moradores.', estado: 'falta' },
    { empresa: 'Uber e Dropbox', tecnica: 'Convites com prémio para os dois lados', historia: 'A Uber dava crédito a quem convidava e a quem era convidado. A Dropbox dava espaço extra aos dois. O fundador da Dropbox contou que isto aumentou os registos de forma permanente (cerca de 60%).', copiar: 'Profissional que traz outro profissional ganha um mês de destaque, e o novo também. O painel do profissional já tem convites; falta o prémio aos dois.', estado: 'parcial' },
    { empresa: 'Hotmail', tecnica: 'Cada utilizador espalha a marca sem querer', historia: 'Cada email enviado levava no fim "Cria o teu email grátis no Hotmail". Cresceu milhões de utilizadores com quase nenhum marketing.', copiar: 'O Flinko já faz isto: os orçamentos em PDF do plano grátis dizem "Orçamento gerado através da Flinko · flinko.pt". O passo seguinte é pôr o mesmo nos cartões, no cartaz com QR e nas mensagens de WhatsApp dos profissionais.', estado: 'parcial' },
    { empresa: 'Thumbtack, Yelp e TripAdvisor', tecnica: 'Uma página no Google para cada serviço e cada cidade', historia: 'Criaram páginas próprias para pesquisas como "canalizador em Austin" ou "restaurantes em Lisboa". Cada página responde a uma pesquisa concreta e aparece no Google sem pagar anúncios.', copiar: 'O Flinko já gera estas páginas sozinho (por exemplo flinko.pt/eletricistas/braga), com os profissionais reais de cada sítio. O passo seguinte é pôr links para elas nas outras páginas e nos grupos de Facebook, e juntar-lhes preços normais e perguntas frequentes de cada ofício.', estado: 'parcial' },
    { empresa: 'DoorDash', tecnica: 'Os fundadores a fazer o serviço', historia: 'No início, os próprios fundadores faziam as entregas para perceberem o que corria mal e para os primeiros clientes ficarem bem servidos.', copiar: 'Um serviço "pede por WhatsApp": o cliente diz o que precisa e a equipa do Flinko encontra-lhe 2 ou 3 profissionais. Dá os primeiros pedidos, ensina o que os clientes querem e cria histórias de sucesso.', estado: 'falta' },
    { empresa: 'Airbnb', tecnica: 'Tirar o medo com uma garantia', historia: 'Depois de um caso grave com a casa de uma anfitriã, o Airbnb criou uma garantia para os anfitriões. A confiança dos novos anfitriões aumentou.', copiar: 'Mais tarde, uma "Garantia Flinko" simples: se o profissional faltar ou não cumprir, o Flinko ajuda a encontrar outro depressa. Para já, mostrar quem tem seguro.', estado: 'falta' },
    { empresa: 'Yelp', tecnica: 'Comunidade local de quem avalia', historia: 'Em cada cidade, um responsável de comunidade organizava eventos para os utilizadores que escreviam mais avaliações, o que manteve a plataforma cheia de avaliações frescas.', copiar: 'Agradecer publicamente (redes sociais) aos clientes e profissionais com melhores avaliações do mês. Custa pouco e incentiva a avaliar.', estado: 'falta' }
  ];

  // Distribui as recomendações por 4 semanas: prioridade 1 primeiro, e a
  // última semana é para medir e decidir.
  function plano(recs) {
    var p1 = recs.filter(function (r) { return r.prioridade === 1; });
    var resto = recs.filter(function (r) { return r.prioridade !== 1; });
    return [
      { semana: 'Semana 1', foco: p1.length ? p1.map(function (r) { return r.titulo; }) : ['Escolher o distrito e os ofícios desta fase'] },
      { semana: 'Semana 2', foco: resto.slice(0, 2).map(function (r) { return r.titulo; }).concat(p1.length ? ['Continuar: ' + p1[0].titulo.toLowerCase()] : []) },
      { semana: 'Semana 3', foco: resto.slice(2, 4).map(function (r) { return r.titulo; }).concat(['Ver os números desta página e cortar o que não resultou']) },
      { semana: 'Semana 4', foco: ['Comparar os 5 números com os de há 4 semanas', 'Decidir: continuar no mesmo distrito ou passar ao seguinte'] }
    ].map(function (s) { s.foco = s.foco.filter(Boolean); return s; });
  }

  return { TEMAS: TEMAS, POLITICAS: POLITICAS, CONCORRENCIA: CONCORRENCIA, CASOS: CASOS, plano: plano };
});
