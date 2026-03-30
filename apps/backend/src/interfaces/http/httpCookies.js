export function parseCookies(req) {
  const raw = req.get("cookie") || "";
  return raw.split(";").reduce((acc, part) => {
    const [key, ...value] = part.trim().split("=");
    if (!key) {
      return acc;
    }
    acc[key] = decodeURIComponent(value.join("="));
    return acc;
  }, {});
}

export function setSessionCookies(res, { accessToken, refreshToken }) {
  const base = {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/"
  };

  res.cookie("mindtrack_access_token", accessToken, base);
  res.cookie("mindtrack_refresh_token", refreshToken, base);
}

export function clearSessionCookies(res) {
  res.clearCookie("mindtrack_access_token", { path: "/" });
  res.clearCookie("mindtrack_refresh_token", { path: "/" });
}
