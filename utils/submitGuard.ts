/**
 * ref 기반 중복 제출 가드 — change-password의 submittingRef 패턴을 함수로
 * 뽑은 것. `submitting` state는 리렌더 후에야 버튼을 잠그므로 같은 tick에
 * 들어온 두 번째 탭을 막지 못한다. 이 가드는 첫 호출이 끝나기 전의 재진입을
 * 동기적으로 차단해 네트워크 요청이 두 번 나가는 것을 막는다.
 *
 * 사용(화면): const guardRef = useRef(createSubmitGuard());
 *            guardRef.current(async () => { ...submit... });
 * 재진입 시 task를 실행하지 않고 undefined를 돌려준다.
 */
export function createSubmitGuard() {
  let locked = false;
  return async function runGuarded<T>(
    task: () => Promise<T>,
  ): Promise<T | undefined> {
    if (locked) return undefined;
    locked = true;
    try {
      return await task();
    } finally {
      locked = false;
    }
  };
}
