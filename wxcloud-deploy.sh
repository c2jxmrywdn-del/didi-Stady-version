#!/usr/bin/env bash
# ==============================================================================
# 滴滴学习版 · 一键部署脚本(wxcloud-deploy)
# ==============================================================================
# 等价于: wxcloud functions deploy --all
# 但提供更友好的输出 + 错误处理 + 二次确认
#
# 使用方法:
#   bash wxcloud-deploy.sh            # 部署所有云函数
#   bash wxcloud-deploy.sh --force     # 跳过确认直接部署
#
# 等价 npm 命令:
#   npm run deploy
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  滴滴学习版 · 一键部署${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# 1. 检查 wxcloud CLI
echo -e "${YELLOW}[1/4]${NC} 检查 wxcloud CLI..."
if ! command -v wxcloud >/dev/null 2>&1; then
  echo -e "${RED}  ✘ 未安装 wxcloud CLI${NC}"
  echo ""
  echo "  请先执行:"
  echo -e "    ${GREEN}npm install -g @wxcloud/cli${NC}"
  echo ""
  echo "  然后重试。"
  exit 1
fi
WXCLOUD_VERSION=$(wxcloud --version 2>&1 | head -1 || echo "unknown")
echo -e "${GREEN}  ✓ wxcloud CLI 已安装${NC} ($WXCLOUD_VERSION)"

# 2. 检查登录状态
echo ""
echo -e "${YELLOW}[2/4]${NC} 检查登录状态..."
if ! wxcloud env list >/dev/null 2>&1; then
  echo -e "${RED}  ✘ 未登录云开发${NC}"
  echo ""
  echo "  请先执行:"
  echo -e "    ${GREEN}wxcloud login${NC}"
  echo ""
  echo "  扫码完成授权后重试。"
  exit 1
fi
echo -e "${GREEN}  ✓ 已登录${NC}"

# 3. 读取环境 ID
echo ""
echo -e "${YELLOW}[3/4]${NC} 读取云开发环境..."
ENV_ID=$(node -e "
  const e = require('./miniprogram/envList.js');
  const envs = e.envList || [];
  if (envs.length === 0 || !envs[0].env) {
    console.error('未配置环境 ID');
    process.exit(1);
  }
  console.log(envs[0].env);
" 2>&1) || {
  echo -e "${RED}  ✘ 未配置云开发环境 ID${NC}"
  echo ""
  echo "  请编辑 miniprogram/envList.js:"
  echo -e "    ${GREEN}module.exports = { envList: [{ env: 'your-env-id' }] }${NC}"
  exit 1
}
echo -e "${GREEN}  ✓ 环境 ID: ${ENV_ID}${NC}"

# 4. 确认部署
echo ""
echo -e "${YELLOW}[4/4]${NC} 准备部署..."
if [ "$1" != "--force" ]; then
  echo ""
  echo "即将部署 6 个云函数到环境: $ENV_ID"
  echo ""
  echo "  - baiduMap"
  echo "  - orderFunctions"
  echo "  - userFunctions"
  echo "  - matchFunctions"
  echo "  - wxpayFunctions"
  echo "  - quickstartFunctions"
  echo ""
  read -p "确认部署? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
  fi
fi

# 执行部署
echo ""
echo -e "${BLUE}开始部署...${NC}"
echo ""

CLOUDFUNCTIONS=(
  "baiduMap"
  "orderFunctions"
  "userFunctions"
  "matchFunctions"
  "wxpayFunctions"
  "quickstartFunctions"
)

TOTAL=${#CLOUDFUNCTIONS[@]}
SUCCESS=0
FAILED=0

for i in "${!CLOUDFUNCTIONS[@]}"; do
  fn="${CLOUDFUNCTIONS[$i]}"
  printf "  [%d/%d] %-25s " "$((i+1))" "$TOTAL" "$fn"

  if wxcloud functions deploy -e "$ENV_ID" -n "$fn" -r --project "$PROJECT_ROOT" 2>&1 | grep -v "^$" > /tmp/wxcloud-deploy-$$.log; then
    echo -e "${GREEN}✓ 成功${NC}"
    SUCCESS=$((SUCCESS + 1))
  else
    echo -e "${RED}✘ 失败${NC}"
    cat /tmp/wxcloud-deploy-$$.log
    FAILED=$((FAILED + 1))
  fi
done

rm -f /tmp/wxcloud-deploy-$$.log

echo ""
echo "============================================="
echo -e "  部署完成"
echo -e "  ${GREEN}成功: $SUCCESS${NC}  ${RED}失败: $FAILED${NC}  ${YELLOW}总计: $TOTAL${NC}"
echo "============================================="
echo ""

if [ $FAILED -gt 0 ]; then
  echo "部分部署失败,请检查上方错误信息。"
  echo "常见原因:"
  echo "  1. 环境 ID 错误 → 检查 miniprogram/envList.js"
  echo "  2. 网络问题 → 重试或使用 npm run deploy:all"
  echo "  3. 微信云开发账户余额不足"
  exit 1
fi

echo "部署完成!可以打开微信开发者工具 → 云开发 → 云函数 查看。"
