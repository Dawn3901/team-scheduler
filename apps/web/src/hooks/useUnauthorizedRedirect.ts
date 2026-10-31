import { useQueryClient } from "@tanstack/react-query";
import { UNAUTHORIZED_EVENT } from "@teamsync/shared";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** request() 清空 token 后派发事件；这里统一清缓存并回登录页。 */
export function useUnauthorizedRedirect(): void {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.clear();
      navigate("/login", { replace: true });
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [navigate, queryClient]);
}
