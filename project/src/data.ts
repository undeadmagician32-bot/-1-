export type Strength = {
  id: string;
  title: string;
  tagline: string;
  icon: 'code' | 'users' | 'compass' | 'brain';
  situation: string;
  action: string;
  result: string;
  // link: 실제로 열리는 공개 웹페이지 주소가 하나 있을 때 사용 (예: moddb, GitHub 등)
  // image: 스크린샷 1장일 때 public/evidence/ 안의 파일 경로
  // images: 스크린샷/사진이 여러 장일 때 (갤러리로 보여줌)
  // links: 공개 링크가 여러 개일 때 (예: 참고한 유튜브 영상 여러 개)
  evidence: {
    label: string;
    link: string;
    image?: string;
    images?: string[];
    links?: { label: string; url: string }[];
    description: string;
  };
};

// TODO: 아래 "[ ]" 로 표시된 항목은 아직 채워지지 않은 항목입니다.
export const profile = {
  name: '양재훈',
  role: 'AI 시대의 미개척지로 나아가는 도전자',
  summary:
    '영어로 소통하는 데 강점이 있고, 새로운 문화나 사고방식을 열린 마음으로 받아들이며, 깊이 생각하는 것을 좋아합니다. [본인의 자기소개 문장을 이어서 적어주세요]',
  location: '경북',
  education: '대졸',
  emailPublic: 'undead32@naver.com',
  interests: ['영어 소통', '높은 수용성(개방성)', '깊이 생각하기'],
};

export const publicScope = {
  target:
    '처음 나를 비즈니스 등으로 접하는 사람에게 내가 어떤 사람인지, 무엇을 좋아하고 어떤 경험을 했는지를 보여주는 개인 소개 페이지입니다.',
  public: ['이력', '학력', '자기소개 및 관심사'],
  private: [
    '정치사상 및 민감정보',
    '비밀키 및 API 키',
    '고유식별정보 (주민등록번호 등)',
  ],
};

export const strengths: Strength[] = [
  {
    id: 'english',
    title: '영어 구사력',
    tagline: '영어로 정보를 찾고 사람들과 교류하는 데 강점이 있습니다',
    icon: 'users',
    situation:
      '게임 커뮤니티 디스코드 등에서 필요한 정보를 찾거나 사람들과 교류해야 하는 상황이 자주 있었습니다.',
    action:
      '오류나 질문점을 구체적인 예시를 들어 교류했습니다. 로그파일의 어느 부분에서 Fatal Error가 떴는지, 어떤 Graphic Asset이 충돌했는지 등을 짚어가며 소통했습니다.',
    result: '결과적으로 모드에서 부딪히는 문제를 해결했습니다.',
    evidence: {
      label: 'Return to the Zone — English Translation (ModDB)',
      link: 'https://www.moddb.com/mods/return-to-the-zone-english-translation',
      image: '/evidence/english-evidence.jpg',
      description: 'ModDB 모드 댓글창에서 영어로 기술적인 문제를 주고받은 대화입니다.',
    },
  },
  {
    id: 'openness',
    title: '높은 수용성',
    tagline: '낯선 환경과 새로운 생각을 거리낌 없이 받아들입니다',
    icon: 'compass',
    situation:
      '평생 살던 경북에서 벗어나, 지금까지 해오던 호텔업종에서도 벗어나 안전관리자에 도전하러 경기도로 이직했습니다.',
    action:
      '이직이나 이사에 거리낌이 없었고, 해외 문화나 지금까지와 전혀 다른 사상이나 아이디어도 적합하다면 기꺼이 받아들였습니다.',
    result:
      '건설이라는 업종에 대한 새로운 경험을 했지만, 너무나도 좋지 않은 환경이라 후회했습니다. 다만 그 경험으로 최저값을 갱신해 욕심을 버릴 수 있게 되었습니다.',
    evidence: {
      label: '[공개 가능한 근거 제목]',
      link: '',
      description: '아직 근거 링크가 입력되지 않았습니다. 실제로 열리는 공개 링크나 스크린샷을 연결해주세요.',
    },
  },
  {
    id: 'deep-thinking',
    title: '깊은 생각에 잠기는 것을 선호',
    tagline: '깊이 생각할 거리가 있는 주제에 자연스럽게 끌립니다',
    icon: 'brain',
    situation:
      '뇌과학 등 사고 관련 유튜브 영상을 즐겨 보는 등, 스스로 깊이 생각할 거리가 있는 주제를 찾아 다녔습니다.',
    action:
      '도파민·동기부여·집중력을 다룬 영상을 보면서 핵 측좌핵, 전전두엽, 오피오이드 회로 같은 개념과 "테이프를 끝까지 재생해보기", 파킨슨 법칙(마감 활용), 점진적으로 집중 시간 늘리기 같은 기법을 손으로 직접 정리했습니다. 거기서 그치지 않고 제 하루 일정(공부와 게임 시간)에 그대로 대입해 왜 공부보다 게임에 더 끌리는지를 도파민 비교 관점에서 분석해봤습니다.',
    result:
      '그 결과 "왜 나는 쉬운 행동에 더 끌리는가"를 뇌과학적으로 이해하게 됐고, 집중력을 늘리기 위한 구체적인 전략(목표를 작게 쪼개기, 마감 걸기, 의식적으로 가치 판단하기 등)을 스스로 정리해 실제 생활에 적용해보고 있습니다.',
    evidence: {
      label: '깊은 생각 — 도파민·집중력 관련 손글씨 메모',
      link: '',
      images: [
        '/evidence/deep-thinking-01.jpg',
        '/evidence/deep-thinking-02.jpg',
        '/evidence/deep-thinking-03.jpg',
        '/evidence/deep-thinking-04.jpg',
        '/evidence/deep-thinking-05.jpg',
        '/evidence/deep-thinking-06.jpg',
        '/evidence/deep-thinking-07.jpg',
        '/evidence/deep-thinking-08.jpg',
        '/evidence/deep-thinking-09.jpg',
        '/evidence/deep-thinking-10.jpg',
      ],
      links: [
        { label: '참고 영상 1', url: 'https://www.youtube.com/watch?v=xkd36cJ6Z78' },
        { label: '참고 영상 2', url: 'https://www.youtube.com/watch?v=6CWq8wyS90o' },
      ],
      description: '도파민과 동기부여, 집중력에 관한 영상을 보며 정리한 손글씨 메모입니다.',
    },
  },
];

// 아래 3개는 실제로 이 페이지 코드에서 발견되어 수정된 결함입니다.
export const defects = [
  {
    before:
      '본문 일부(푸터, 결함 안내 문구, 상황·행동·결과 라벨)의 글자색이 text-ink-400(#525a6b)으로, 배경과의 명암 대비가 약 2.6:1에 그쳐 기준(4.5:1) 미달이었습니다.',
    after:
      '해당 글자색을 text-ink-300(#7c8598)으로 변경해 대비율을 약 4.8~5:1로 끌어올렸습니다.',
  },
  {
    before:
      '파비콘이 /vite.svg를 참조했지만 배포된 파일에 해당 이미지가 없어, 공개 화면에서 404 요청과 함께 콘솔에 빨간 오류가 발생했습니다.',
    after:
      '외부 파일 요청이 필요 없는 data URI 아이콘으로 교체해 404 요청 자체가 발생하지 않도록 했습니다.',
  },
  {
    before:
      '강점 카드의 펼치기 버튼에서 화면에 보이는 글자는 "상황 · 행동 · 결과 보기"인데, aria-label이 이를 다른 문구로 덮어써 음성 인식 사용자가 보이는 글자를 그대로 말해도 버튼이 실행되지 않는 문제가 있었습니다(WCAG 2.5.3 위반).',
    after:
      'aria-label을 제거하고 화면에 보이는 글자를 그대로 접근성 이름으로 사용하도록 고쳤습니다.',
  },
];
