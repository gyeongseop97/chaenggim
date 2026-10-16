// KMA warning areas: official code CSV and administrative area table, retrieved 2026-10-15.
// Sources: https://apihub.kma.go.kr/apiList.do?seqApi=10&seqApiSub=288
// https://www.weather.go.kr/w/forecast/guide/wrn-area.do
// Keep these official mappings together when updating regional subdivisions.
const AREA_DATA = [["L1000000","00000000","전국",[]],["L1010000","L1000000","경기도",["경기도"]],["L1010200","L1010000","광명",["광명시"]],["L1010300","L1010000","과천",["과천시"]],["L1010400","L1010000","안산",["안산시"]],["L1010500","L1010000","시흥",["시흥시"]],["L1010600","L1010000","부천",["부천시"]],["L1010700","L1010000","김포",["김포시"]],["L1010900","L1110000","강화",["강화군(우도 제외)"]],["L1011100","L1010000","동두천",["동두천시"]],["L1011200","L1010000","연천",["연천군"]],["L1011300","L1010000","포천",["포천시"]],["L1011400","L1010000","가평",["가평군"]],["L1011500","L1010000","고양",["고양시"]],["L1011600","L1010000","양주",["양주시"]],["L1011700","L1010000","의정부",["의정부시"]],["L1011900","L1010000","수원",["수원시"]],["L1012000","L1010000","성남",["성남시"]],["L1012100","L1010000","안양",["안양시"]],["L1012200","L1010000","구리",["구리시"]],["L1012300","L1010000","남양주",["남양주시"]],["L1012400","L1010000","오산",["오산시"]],["L1012500","L1010000","평택",["평택시"]],["L1012600","L1010000","군포",["군포시"]],["L1012700","L1010000","의왕",["의왕시"]],["L1012800","L1010000","하남",["하남시"]],["L1013000","L1010000","이천",["이천시"]],["L1013100","L1010000","안성",["안성시"]],["L1013200","L1010000","화성",["화성시"]],["L1013400","L1010000","광주",["광주시","광주광역시"]],["L1013600","L1110000","옹진",["인천광역시 중 옹진군(백령도.대청도.소청도.연평도 제외)"]],["L1013700","L1010000","파주",["파주시"]],["L1013710","L1013700","파주동북부",["문산읍.법원읍.파주읍.적성면.파평면"]],["L1013720","L1013700","파주서북부",["장단면.군내면.진서면.진동면"]],["L1013730","L1013700","파주남부",["조리읍.광탄면.탄현면.월롱면.동지역"]],["L1013800","L1010000","용인",["용인시"]],["L1013810","L1013800","용인동북부",["포곡읍.모현읍.양지면.처인구 동지역"]],["L1013820","L1013800","용인서북부",["기흥구.수지구"]],["L1013830","L1013800","용인남부",["이동읍.남사읍.원삼면.백암면"]],["L1013900","L1010000","여주",["여주시"]],["L1013910","L1013900","여주동남부",["가남읍.점동면.북내면.강천면.여흥동.중앙동.오학동"]],["L1013920","L1013900","여주서부",["산북면.금사면.흥천면.대신면.세종대왕면"]],["L1014000","L1000000","서해5도",["인천광역시 중 옹진군 백령도.대청도.소청도.연평도.강화군 우도"]],["L1014200","L1014000","백령도.대청도",["옹진군 백령면.대청면"]],["L1014300","L1014000","연평도.우도",["옹진군 연평면.강화군 서도면 우도"]],["L1014400","L1010000","양평",["양평시"]],["L1014410","L1014400","양평동부",["단월면.청운면.양동면.지평면.용문면"]],["L1014420","L1014400","양평서부",["양평읍.강상면.강하면.옥천면.양서면.서종면.개군면"]],["L1020000","L1000000","강원도",["강원특별자치도"]],["L1020300","L1020000","태백",["태백시"]],["L1020800","L1020000","영월",["영월군"]],["L1021100","L1020000","횡성",["횡성군"]],["L1021200","L1020000","원주",["원주시"]],["L1021300","L1020000","철원",["철원군"]],["L1021400","L1020000","화천",["화천군"]],["L1021600","L1020000","춘천",["춘천시"]],["L1021900","L1020000","동해",["동해시"]],["L1021910","L1021900","동해평지",["동해시 산지 제외 지역"]],["L1021920","L1021900","동해산지",["동해시 삼화동.신흥동.비천동.이로동.달방동.이기동"]],["L1022000","L1020000","삼척",["삼척시"]],["L1022010","L1022000","삼척평지",["삼척시 산지 제외 지역"]],["L1022020","L1022000","삼척산지",["삼척시 도계읍.미로면.하장면.노곡면.가곡면.신기면"]],["L1022100","L1020000","속초",["속초시"]],["L1022110","L1022100","속초평지",["속초시 산지 제외 지역"]],["L1022120","L1022100","속초산지",["속초시 대포동.노학동.도문동.설악동"]],["L1022200","L1020000","고성",["강원도 고성군","경상남도 고성군"]],["L1022210","L1022200","고성평지",["고성군 산지 제외 지역"]],["L1022220","L1022200","고성산지",["고성군 간성읍.수동면"]],["L1022300","L1020000","양양",["양양군"]],["L1022310","L1022300","양양평지",["양양군 산지 제외 지역"]],["L1022320","L1022300","양양산지",["양양군 강현면.서면.현북면"]],["L1022400","L1020000","평창",["평창군"]],["L1022410","L1022400","평창평지",["평창군 산지 제외 지역"]],["L1022420","L1022400","평창산지",["평창군 진부면.대관령면"]],["L1022500","L1020000","강릉",["강릉시"]],["L1022510","L1022500","강릉평지",["강릉시 산지 제외 지역"]],["L1022520","L1022500","강릉산지",["강릉시 연곡면.성산면.왕산면"]],["L1022600","L1020000","정선",["정선군"]],["L1022610","L1022600","정선평지",["정선군 산지 제외 지역"]],["L1022620","L1022600","정선산지",["정선군 여량면.임계면.북평면.화암면.사북읍.고한읍"]],["L1022700","L1020000","홍천",["홍천군"]],["L1022710","L1022700","홍천평지",["홍천군 산지 제외 지역"]],["L1022720","L1022700","홍천산지",["홍천군 내면"]],["L1022800","L1020000","양구",["양구군"]],["L1022810","L1022800","양구평지",["양구군 산지 제외 지역"]],["L1022820","L1022800","양구산지",["양구군 해안면"]],["L1022900","L1020000","인제",["인제군"]],["L1022910","L1022900","인제평지",["인제군 산지 제외 지역"]],["L1022920","L1022900","인제산지",["인제군 서화면.북면.기린면.상남면"]],["L1030000","L1000000","충청남도",["충청남도"]],["L1030100","L1120000","대전",["대전광역시"]],["L1030200","L1030000","천안",["천안시"]],["L1030300","L1030000","공주",["공주시"]],["L1030400","L1030000","아산",["아산시"]],["L1030500","L1030000","논산",["논산시"]],["L1030600","L1030000","금산",["금산군"]],["L1030800","L1030000","부여",["부여군"]],["L1030900","L1030000","청양",["청양군"]],["L1031000","L1030000","예산",["예산군"]],["L1031100","L1030000","태안",["태안군"]],["L1031200","L1030000","당진",["당진시"]],["L1031300","L1030000","서산",["서산시"]],["L1031500","L1030000","서천",["서천군"]],["L1031700","L1030000","계룡",["계룡시"]],["L1031900","L1030000","보령",["보령시"]],["L1031910","L1031900","보령(도서제외)",["보령(보령도서 제외)"]],["L1031920","L1031900","보령도서",["오천면 외연도리.녹도리.삽시도리.원산도리.효자도리"]],["L1032000","L1030000","홍성",["홍성군"]],["L1032010","L1032000","홍성동부",["홍성읍.광천읍.홍북읍.금마면.홍동면.장곡면"]],["L1032020","L1032000","홍성서부",["은하면.결성면.서부면.갈산면.구항면"]],["L1040000","L1000000","충청북도",["충청북도"]],["L1040300","L1040000","보은",["보은군"]],["L1040400","L1040000","괴산",["괴산군"]],["L1040600","L1040000","옥천",["옥천군"]],["L1040700","L1040000","영동",["영동군"]],["L1040800","L1040000","충주",["충주시"]],["L1040900","L1040000","제천",["제천시"]],["L1041000","L1040000","진천",["진천군"]],["L1041100","L1040000","음성",["음성군"]],["L1041200","L1040000","단양",["단양군"]],["L1041300","L1040000","증평",["증평군"]],["L1041400","L1040000","청주",["청주시"]],["L1041410","L1041400","청주동부",["상당구 낭성면.미원면.가덕면.남일면.문의면"]],["L1041420","L1041400","청주서부",["청원구.흥덕구.서원구.상당구 동지역"]],["L1050000","L1000000","전라남도",["전라남도"]],["L1050300","L1050000","담양",["담양군"]],["L1050600","L1050000","장성",["장성군"]],["L1050700","L1050000","화순",["화순군"]],["L1050900","L1050000","보성",["보성군"]],["L1051000","L1050000","여수",["여수시"]],["L1051100","L1050000","광양",["광양시"]],["L1051200","L1050000","순천",["순천시"]],["L1051300","L1050000","장흥",["장흥군"]],["L1051400","L1050000","강진",["강진군"]],["L1051700","L1050000","영암",["영암군"]],["L1051900","L1050000","함평",["함평군"]],["L1052100","L1050000","목포",["목포시"]],["L1052200","L1050000","신안(흑산면제외)",["신안군(흑산면제외)"]],["L1052300","L1050000","진도",["진도군"]],["L1052400","L1000000","흑산도.홍도",["흑산면"]],["L1052500","L1052400","흑산도.홍도",["흑산면"]],["L1052600","L1050000","거문도.초도",["삼산면"]],["L1052700","L1050000","영광",["영광시"]],["L1052710","L1052700","영광(낙월면 제외)",["영광(영광군 낙월면 제외)"]],["L1052720","L1052700","영광낙월면",["영광군 낙월면"]],["L1052800","L1050000","나주",["나주시"]],["L1052810","L1052800","나주동남부",["세지면.봉황면.다도면"]],["L1052820","L1052800","나주서북부",["남평읍.왕곡면.반남면.공산면.동강면.다시면.문평면.노안면.금천면.산포면.나주시 동 지역"]],["L1052900","L1050000","곡성",["곡성군"]],["L1052910","L1052900","곡성북부",["옥과면.입면.겸면.오산면.삼기면.곡성읍.오곡면.고달면"]],["L1052920","L1052900","곡성남부",["석곡면.목사동면.죽곡면"]],["L1053000","L1050000","구례",["구례군"]],["L1053010","L1053000","구례평지",["구례읍.문척면.간전면.용방면.토지면.마산면.광의면.산동면 중 300m 미만 지역"]],["L1053020","L1053000","구례산간",["토지면.마산면.광의면.산동면 중 300m 이상 지역"]],["L1053100","L1050000","고흥",["고흥군"]],["L1053110","L1053100","고흥북부",["고흥읍.두원면.점암면.과역면.남양면.동강면.대서면"]],["L1053120","L1053100","고흥남부",["도양읍.도덕면.풍양면.금산면.도화면.영남면.포두면.봉래면.동일면"]],["L1053200","L1050000","해남",["해남군"]],["L1053210","L1053200","해남북부",["황산면.산이면.문내면.화원면.해남읍.삼산면.옥천면.계곡면.마산면"]],["L1053220","L1053200","해남남부",["화산면.현산면.송지면.북평면.북일면"]],["L1053300","L1050000","완도",["완도군"]],["L1053310","L1053300","완도(여서도 제외)",["완도(청산면 여서리 제외)"]],["L1053320","L1053300","완도여서도",["청산면 여서리"]],["L1053400","L1050000","무안",["무안군"]],["L1053410","L1053400","무안북부",["해제면.청계면.현경면.망운면.운남면.무안읍"]],["L1053420","L1053400","무안남부",["일로읍.삼향읍.몽탄면"]],["L1060000","L1000000","전북자치도",["전북특별자치도"]],["L1060100","L1060000","고창",["고창군"]],["L1060400","L1060000","김제",["김제시"]],["L1060500","L1060000","완주",["완주군"]],["L1060600","L1060000","진안",["진안군"]],["L1060700","L1060000","무주",["무주군"]],["L1060800","L1060000","장수",["장수군"]],["L1060900","L1060000","임실",["임실군"]],["L1061000","L1060000","순창",["순창군"]],["L1061100","L1060000","익산",["익산시"]],["L1061200","L1060000","정읍",["정읍시"]],["L1061300","L1060000","전주",["전주시"]],["L1061400","L1060000","남원",["남원시"]],["L1061500","L1060000","부안",["부안군"]],["L1061510","L1061500","부안(위도면 제외)",["부안(부안군 위도면 제외)"]],["L1061520","L1061500","부안위도면",["부안군 위도면"]],["L1061600","L1060000","군산",["군산시"]],["L1061610","L1061600","군산(옥도면 제외)",["군산(군산시 옥도면 제외)"]],["L1061620","L1061600","군산옥도면(어청도 제외)",["군산시 옥도면(어청도리 제외)"]],["L1061630","L1061600","군산어청도",["군산시 옥도면 어청도리"]],["L1070000","L1000000","경상북도",["경상북도"]],["L1070200","L1140000","군위",["군위군"]],["L1070300","L1070000","구미",["구미시"]],["L1070400","L1070000","영천",["영천시"]],["L1070500","L1070000","경산",["경산시"]],["L1070700","L1070000","청도",["청도군"]],["L1070800","L1070000","고령",["고령군"]],["L1070900","L1070000","성주",["성주군"]],["L1071000","L1070000","칠곡",["칠곡군"]],["L1071200","L1070000","상주",["상주시"]],["L1071300","L1070000","문경",["문경시"]],["L1071400","L1070000","예천",["예천군"]],["L1071600","L1070000","영주",["영주시"]],["L1071700","L1070000","의성",["의성군"]],["L1071800","L1070000","청송",["청송군"]],["L1072100","L1600000","울릉도.독도",["울릉군"]],["L1072200","L1070000","영덕",["영덕군"]],["L1072400","L1070000","포항",["포항시"]],["L1072600","L1070000","김천",["김천시"]],["L1072610","L1072600","김천북부",["대항면.봉산면.어모면.감문면.개령면.아포읍.남면.농소면.감천면.김천시 동 지역(7개 동)"]],["L1072620","L1072600","김천남부",["조마면.구성면.지례면.부항면.대덕면.증산면"]],["L1072700","L1070000","안동",["안동시"]],["L1072710","L1072700","안동북부",["도산면.예안면.녹전면.와룡면.북후면"]],["L1072720","L1072700","안동동남부",["임동면.길안면.임하면.남선면"]],["L1072730","L1072700","안동서부",["풍산읍.서후면.풍천면.남후면.일직면.안동시 동 지역(10개 동)"]],["L1072800","L1070000","영양",["영양군"]],["L1072810","L1072800","영양평지",["영양군 산지 제외 지역"]],["L1072820","L1072800","영양산지",["영양군 수비면.일월면"]],["L1072900","L1070000","봉화",["봉화군"]],["L1072910","L1072900","봉화평지",["봉화군 산지 제외 지역"]],["L1072920","L1072900","봉화산지",["봉화군 석포면.소천면.재산면"]],["L1073000","L1070000","울진",["울진군"]],["L1073010","L1073000","울진평지",["울진군 산지 제외 지역"]],["L1073020","L1073000","울진산지",["울진군 금강송면"]],["L1073100","L1070000","경주",["경주시"]],["L1073110","L1073100","경주중북부",["안강읍.강동면.천북면.현곡면.경주시 동 지역(10개 동)"]],["L1073120","L1073100","경주동부",["감포읍.문무대왕면.양남면"]],["L1073130","L1073100","경주남부",["외동읍.내남면"]],["L1073140","L1073100","경주서부",["건천읍.산내면.서면"]],["L1080000","L1000000","경상남도",["경상남도"]],["L1080500","L1080000","양산",["양산시"]],["L1080600","L1080000","창원",["창원시"]],["L1080900","L1080000","김해",["김해시"]],["L1081000","L1080000","밀양",["밀양시"]],["L1081100","L1080000","의령",["의령군"]],["L1081200","L1080000","함안",["함안군"]],["L1081300","L1080000","창녕",["창녕군"]],["L1081400","L1080000","진주",["진주시"]],["L1082000","L1080000","통영",["통영시"]],["L1082100","L1080000","사천",["사천시"]],["L1082200","L1080000","거제",["거제시"]],["L1082300","L1080000","고성",["강원도 고성군","경상남도 고성군"]],["L1082400","L1080000","남해",["남해군"]],["L1082500","L1150000","부산동부",["기장군.해운대구.수영구.남구"]],["L1082600","L1150000","부산중부",["금정구.북구.동래구.연제구.부산진구.사상구"]],["L1082700","L1150000","부산서부",["강서구.사하구.영도구.서구.동구.중구"]],["L1082800","L1160000","울산동부",["북구.동구.중구.남구"]],["L1082900","L1160000","울산서부",["울주군"]],["L1083000","L1080000","하동",["하동군"]],["L1083010","L1083000","하동북부",["화개면.청암면.악양면"]],["L1083020","L1083000","하동남부",["하동읍.적량면.횡천면.고전면.금남면.진교면.양보면.북천면.옥정면.금성면"]],["L1083100","L1080000","산청",["산청군"]],["L1083110","L1083100","산청북부",["산청읍.차황면.오부면.생초면.금서면"]],["L1083120","L1083100","산청서남부",["삼장면.시천면"]],["L1083130","L1083100","산청동남부",["단성면.신안면.생비량면.신등면"]],["L1083200","L1080000","함양",["함양군"]],["L1083210","L1083200","함양중부",["마천면.함양읍.휴천면.유림면.수동면.지곡면.안의면.백전면.병곡면"]],["L1083220","L1083200","함양서북부",["서상면.서하면"]],["L1083300","L1080000","거창",["거창군"]],["L1083310","L1083300","거창북부",["주상면.웅양면.고제면.북상면.위천면.가북면"]],["L1083320","L1083300","거창남부",["거창읍.마리면.남상면.남하면.신원면.가조면"]],["L1083400","L1080000","합천",["합천군"]],["L1083410","L1083400","합천서북부",["가야면.야로면.묘산면.봉산면.대병면"]],["L1083420","L1083400","합천중부",["합천읍.용주면.대양면.율곡면.쌍책면.초계면.적중면.덕곡면.청덕면"]],["L1083430","L1083400","합천남부",["쌍백면.삼가면.가회면"]],["L1090000","L1000000","제주도",["제주특별자치도"]],["L1090500","L1090000","제주도산지",["제주특별자치도 중 산지 지역(해발고도 600m 이상)"]],["L1091000","L1090000","추자도",["추자면"]],["L1091300","L1090000","제주시(산지 제외)",["제주시(제주도산지 제외)"]],["L1091310","L1091300","제주시서부",["제주시 한림읍.한경면(제주시중산간 제외)"]],["L1091320","L1091300","제주시북부",["제주시(우도면.한경면.추자면(제주시중산간.제주도산지 제외))"]],["L1091330","L1091300","제주시동부",["제주시 구좌읍.우도면(제주시중산간 제외)"]],["L1091340","L1091300","제주시중산간",["제주시(추자면.우도면 제외) 중 해발고도 200m 이상에서 600m 미만 지역"]],["L1091400","L1090000","서귀포시(산지 제외)",["서귀포시(제주도산지 제외)"]],["L1091410","L1091400","서귀포시서부",["서귀포시 대정읍(서귀포시중산간 제외)"]],["L1091420","L1091400","서귀포시남부",["서귀포시(대정읍.성산읍.표선면(서귀포시산간.제주도산지 제외))"]],["L1091430","L1091400","서귀포시동부",["서귀포시 성산읍.표선면(서귀포시중산간 제외)"]],["L1091440","L1091400","서귀포시중산간",["서귀포시 중 해발고도 200m 이상에서 600m 미만 지역"]],["L1100000","L1000000","서울",["서울특별시"]],["L1100100","L1100000","서울동남권",["강동구.송파구.강남구.서초구"]],["L1100200","L1100000","서울동북권",["도봉구.노원구.강북구.성북구.동대문구.중랑구.성동구.광진구"]],["L1100300","L1100000","서울서남권",["강서구.양천구.구로구.영등포구.동작구.관악구.금천구"]],["L1100400","L1100000","서울서북권",["은평구.종로구.마포구.서대문구.중구.용산구"]],["L1110000","L1000000","인천",["인천광역시","인천광역시(강화군.옹진군 제외)"]],["L1110100","L1110000","인천",["인천광역시","인천광역시(강화군.옹진군 제외)"]],["L1110110","L1110100","인천영종",["중구 영종동.영종1동.영종2동.운서동.용유동"]],["L1110120","L1110100","인천남부",["동구.미추홀구.연수구.남동구.중구(인천영종 제외)"]],["L1110130","L1110100","인천북부",["서구.부평구.계양구"]],["L1120000","L1000000","대전",["대전광역시"]],["L1130000","L1000000","광주",["광주시","광주광역시"]],["L1130100","L1130000","광주",["광주시","광주광역시"]],["L1130110","L1130100","광주서부",["광산구"]],["L1130120","L1130100","광주동부",["동구.서구.남구.북구"]],["L1140000","L1000000","대구",["대구광역시"]],["L1140100","L1140000","대구중부",["중구.동구.서구.남구.북구.수성구.달서구"]],["L1140200","L1140000","달성",["달성군"]],["L1140210","L1140200","달성북부",["다사읍.하빈면"]],["L1140220","L1140200","달성남부",["화원읍.논공읍.옥포읍.가창면.유가읍.현풍읍.구지면"]],["L1150000","L1000000","부산",["부산광역시"]],["L1160000","L1000000","울산",["울산광역시"]],["L1170000","L1000000","세종",["세종특별자치도"]],["L1170100","L1170000","세종",["세종특별자치도"]],["L1170110","L1170100","세종북부",["소정면.전의면.전동면.조치원읍"]],["L1170120","L1170100","세종남부",["행정동.연서면.연기면.연동면.부강면.금남면.장군면"]],["L1600000","L1000000","울릉도.독도",["울릉군"]]];
const AREAS = new Map(AREA_DATA.map(([id, parentId, name, descriptions]) => [id, { id, parentId, name, descriptions }]));
const PARENTS = new Set(AREA_DATA.map(row => row[1]));
const PROVINCES = [
  ['L1010000', ['경기도', '경기']], ['L1020000', ['강원특별자치도', '강원도', '강원']],
  ['L1030000', ['충청남도', '충남']], ['L1040000', ['충청북도', '충북']],
  ['L1050000', ['전라남도', '전남']], ['L1060000', ['전북특별자치도', '전북자치도', '전라북도', '전북']],
  ['L1070000', ['경상북도', '경북']], ['L1080000', ['경상남도', '경남']],
  ['L1090000', ['제주특별자치도', '제주도', '제주']], ['L1100000', ['서울특별시', '서울시', '서울']],
  ['L1110000', ['인천광역시', '인천시', '인천']], ['L1120000', ['대전광역시', '대전시', '대전']],
  // Bare 광주 is ambiguous with 광주시 in Gyeonggi-do.
  ['L1130000', ['광주광역시']], ['L1140000', ['대구광역시', '대구시', '대구']],
  ['L1150000', ['부산광역시', '부산시', '부산']], ['L1160000', ['울산광역시', '울산시', '울산']],
  ['L1170000', ['세종특별자치시', '세종시', '세종']]
];
const SPECIAL_PROVINCE = new Map([
  ['L1014000', 'L1110000'], ['L1052400', 'L1050000'], ['L1600000', 'L1070000']
]);
const SOURCE_URL = 'https://apihub.kma.go.kr/apiList.do?seqApi=10&seqApiSub=288';
const WARNING_TYPES = { W: '강풍', R: '호우', C: '한파', D: '건조', O: '폭풍해일', N: '지진해일', V: '풍랑', T: '태풍', S: '대설', Y: '황사', H: '폭염', F: '안개', K: '열대야' };
const CACHE = new WeakMap();
const normalizeName = value => String(value || '').normalize('NFKC').replace(/\s/g, '');
const tokensFor = value => String(value || '').normalize('NFKC').split(/[\s,，/·]+/).filter(Boolean);
const adminStem = value => normalizeName(value).replace(/\([^)]*\)/g, '').replace(/(?:특별자치시|특별자치도|특별시|광역시|시|군)$/, '');

function ancestry(area) {
  const rows = [];
  const visited = new Set();
  while (area && !visited.has(area.id)) {
    visited.add(area.id); rows.push(area); area = AREAS.get(area.parentId);
  }
  return rows;
}

function provinceOf(area) {
  for (const row of ancestry(area)) {
    if (PROVINCES.some(([id]) => id === row.id)) return row.id;
    if (SPECIAL_PROVINCE.has(row.id)) return SPECIAL_PROVINCE.get(row.id);
  }
  return null;
}

function hasCityContext(area, province, tokens) {
  return ancestry(area).slice(1).filter(row => ![province, 'L1000000'].includes(row.id)).every(row => {
    // These island groups are official group labels, rather than administrative cities.
    if (SPECIAL_PROVINCE.has(row.id)) return true;
    return tokens.some(token => adminStem(token) === adminStem(row.name));
  });
}

function administrativeMatch(description, tokens) {
  // The four listed districts do not intersect Yeongjong; Jung-gu still needs its island boundary.
  if (description === '동구.미추홀구.연수구.남동구.중구(인천영종 제외)') return ['동구', '미추홀구', '연수구', '남동구'].some(name => tokens.includes(name));
  // Altitude and exclusion boundaries cannot be established from an administrative name.
  if (/제외|이상|미만|해발|중산간/.test(description)) return false;
  return description.split(/[.·,]/).some(part => {
    const words = part.trim().split(/\s+/).filter(Boolean);
    // A generic "동지역" is not a named administrative district. Never guess its boundary.
    if (!words.length || words.some(word => !/^[가-힣0-9]+(?:읍|면|동|구|시|군|도)$/.test(word))) return false;
    return words.every(word => tokens.includes(word));
  });
}

/** Resolve an official leaf warning zone only when a Korean administrative address proves it.
 * Coordinates are validated, but never assigned by nearest observation station.
 * Ambiguous/altitude-dependent/sparsely labelled addresses deliberately return null.
 */
export function resolveKmaWarningArea({ latitude, longitude, regionName } = {}) {
  const lat = Number(latitude), lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 32.5 || lat > 39 || lon < 124 || lon > 132) return null;
  const tokens = tokensFor(regionName);
  const provinces = PROVINCES.filter(([, aliases]) => aliases.some(alias => tokens.includes(alias)));
  if (provinces.length !== 1) return null;
  const province = provinces[0][0];
  const candidates = [...AREAS.values()].filter(area => {
    if (PARENTS.has(area.id) || provinceOf(area) !== province || !hasCityContext(area, province, tokens)) return false;
    // Yeosu's offshore Samsan-myeon has its own sibling warning zone.
    if (area.id === 'L1051000' && (!tokens.some(token => /[읍면동]$/.test(token)) || tokens.includes('삼산면'))) return false;
    return area.descriptions.some(description => administrativeMatch(description, tokens));
  });
  if (candidates.length !== 1) return null;
  const area = candidates[0];
  return { id: area.id, name: area.name, ancestorIds: ancestry(area).map(row => row.id), mappingSource: '기상청 특보구역 행정구역표', mappingAsOf: '2026-10-15' };
}

function csvFields(line) {
  const fields = []; let value = '', quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { fields.push(value.trim()); value = ''; }
    else value += char;
  }
  if (quoted) throw new Error('Malformed warning data');
  fields.push(value.trim());
  return fields;
}

function kstIso(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^\d{12}$/.test(digits)) return null;
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:00+09:00`;
  const time = Date.parse(iso);
  return Number.isFinite(time) && kstCompact(time) === digits ? iso : null;
}

function kstCompact(time) {
  return new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace(/[-T:]/g, '');
}

/** Parse the documented disp=0 CSV format. Invalid responses never mean "no warnings". */
export function parseKmaWarningCsv(text) {
  if (typeof text !== 'string' || text.length > 1024 * 1024 || /<(?:html|\?xml|OpenAPI|response|error)/i.test(text) || /(?:#\s*ERROR|인증키.*(?:오류|없|실패)|API키.*오류)/i.test(text)) throw new Error('Unavailable warning data');
  let header = ['REG_UP', 'REG_UP_KO', 'REG_ID', 'REG_KO', 'TM_FC', 'TM_EF', 'WRN', 'LVL', 'CMD'];
  let recognizable = /#\s*START7777/i.test(text) && /#\s*END7777/i.test(text);
  const rows = [];
  for (let line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    const headerLine = line.replace(/^#\s*/, '');
    if (/REG_ID/.test(headerLine) && /TM_FC/.test(headerLine) && /WRN/.test(headerLine) && headerLine.includes(',')) {
      header = csvFields(headerLine).map(field => field.toUpperCase()); recognizable = true; continue;
    }
    if (line.startsWith('#')) continue;
    if (!line.includes(',')) throw new Error('Unrecognized warning data');
    const fields = csvFields(line);
    const row = Object.fromEntries(header.map((key, index) => [key, fields[index] || '']));
    // Official codes: LVL 1=preliminary, 2=advisory, 3=warning; CMD 3/4/7 are cancellation commands.
    // https://apihub.kma.go.kr/static/html/attach/wrn_table.html
    if (!/^[LS]\d{7}$/.test(row.REG_ID) || !/^[123]$/.test(row.LVL) || !/^[1-7]$/.test(row.CMD) || !WARNING_TYPES[row.WRN] || !kstIso(row.TM_FC) || !kstIso(row.TM_EF)) throw new Error('Invalid warning record');
    rows.push(row); recognizable = true;
  }
  if (!recognizable) throw new Error('Missing warning records');
  return rows;
}

/** disp=1 currently returns UTF-8 JSON with Korean labels, unlike the EUC-KR disp=0 CSV. */
export function parseKmaWarningJson(input) {
  if (typeof input === 'string' && input.length > 1024 * 1024) throw new Error('Unavailable warning data');
  let rows;
  try { rows = typeof input === 'string' ? JSON.parse(input.replace(/^\uFEFF/, '')) : input; }
  catch { throw new Error('Unavailable warning data'); }
  if (!Array.isArray(rows)) throw new Error('Unavailable warning data');
  const typeLabels = Object.fromEntries(Object.entries(WARNING_TYPES).map(([code, label]) => [label, code]));
  typeLabels['해일'] = 'O';
  const levelLabels = { 예비: '1', 예비특보: '1', 주의: '2', 주의보: '2', 경보: '3' };
  const commandLabels = { 발표: '1', 대치: '2', 해제: '3', 대치해제: '4', 연장: '5', 변경: '6', 변경해제: '7' };
  const label = value => String(value ?? '').replace(/\s/g, '');
  return rows.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid warning record');
    const row = Object.fromEntries(['REG_UP', 'REG_UP_KO', 'REG_ID', 'REG_KO', 'TM_FC', 'TM_EF'].map(key => [key, String(value[key] ?? '').trim()]));
    row.WRN = typeLabels[label(value.WRN)] || label(value.WRN);
    row.LVL = levelLabels[label(value.LVL)] || label(value.LVL);
    row.CMD = commandLabels[label(value.CMD)] || label(value.CMD);
    if (!/^[LS]\d{7}$/.test(row.REG_ID) || !/^[123]$/.test(row.LVL) || !/^[1-7]$/.test(row.CMD) || !WARNING_TYPES[row.WRN] || !kstIso(row.TM_FC) || !kstIso(row.TM_EF)) throw new Error('Invalid warning record');
    return row;
  });
}

async function loadWarnings({ apiKey, fetchImpl, time }) {
  let cache = CACHE.get(fetchImpl);
  if (!cache) { cache = new Map(); CACHE.set(fetchImpl, cache); }
  const cached = cache.get(apiKey);
  if (cached && cached.expires > time) return cached.promise;
  // Bound retained secret values and snapshots in a long-lived process.
  if (cache.size >= 4) cache.clear();
  const promise = (async () => {
    const url = new URL('https://apihub.kma.go.kr/api/typ01/url/wrn_now_data_new.php');
    url.search = new URLSearchParams({ fe: 'e', tm: kstCompact(time), disp: '1', help: '0', authKey: apiKey }).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetchImpl(url.toString(), { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Warning service unavailable');
      return parseKmaWarningJson(await response.text());
    } finally { clearTimeout(timer); }
  })();
  cache.set(apiKey, { expires: time + 5 * 60 * 1000, promise });
  try { return await promise; } catch (error) { cache.delete(apiKey); throw error; }
}

/** Server-only KMA authKey. Errors and result metadata deliberately omit request URLs and secrets. */
export async function getKmaWarnings(location, { apiKey, fetchImpl = fetch, now = Date.now } = {}) {
  const unavailable = { warnings: [], warningStatus: 'unavailable', warningSource: '기상청', warningSourceUrl: SOURCE_URL };
  const area = resolveKmaWarningArea(location);
  const time = typeof now === 'function' ? Number(now()) : Number(now);
  if (!area || typeof apiKey !== 'string' || !apiKey.trim() || !Number.isFinite(time)) return unavailable;
  try {
    const rows = await loadWarnings({ apiKey: apiKey.trim(), fetchImpl, time });
    const latest = new Map();
    for (const row of rows) {
      if (!area.ancestorIds.includes(row.REG_ID)) continue;
      const key = `${row.REG_ID}:${row.WRN}`;
      if (!latest.has(key) || latest.get(key).TM_FC <= row.TM_FC) latest.set(key, row);
    }
    const warnings = [...latest.values()].filter(row => ['2', '3'].includes(row.LVL) && ['1', '2', '5', '6'].includes(row.CMD) && Date.parse(kstIso(row.TM_EF)) <= time).map(row => {
      const level = row.LVL === '3' ? '경보' : '주의보';
      return { id: `${row.REG_ID}:${row.WRN}:${row.TM_FC}`, title: `${WARNING_TYPES[row.WRN]}${level}`, level, type: WARNING_TYPES[row.WRN], issuedAt: kstIso(row.TM_FC), effectiveAt: kstIso(row.TM_EF), regionId: row.REG_ID, regionName: AREAS.get(row.REG_ID)?.name || row.REG_KO, source: '기상청', sourceUrl: SOURCE_URL };
    }).sort((a, b) => (a.level === '경보' ? 0 : 1) - (b.level === '경보' ? 0 : 1) || a.title.localeCompare(b.title, 'ko'));
    return { warnings, warningStatus: 'ok', warningRegion: { id: area.id, name: area.name }, warningSource: '기상청', warningSourceUrl: SOURCE_URL, warningRetrievedAt: new Date(time).toISOString() };
  } catch { return unavailable; }
}
