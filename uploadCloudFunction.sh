#!/usr/bin/env bash
# ==============================================================================
# 滴滴学习版 · 云函数批量部署脚本(@wxcloud/cli 版本)
# ==============================================================================
# 前置条件:
#   1. 已安装 Node.js >= 16
#   2. 已安装 @wxcloud/cli:  npm install -g @wxcloud/cli
#   3. 已通过微信云开发授权:  wxcloud login
#   4. 已在 miniprogram/envList.js 中配置 EnvId
#
# 使用方法:
#   bash uploadCloudFunction.sh                  # 部署所有云函数
#   bash uploadCloudFunction.sh baiduMap         # 只部署 baiduMap
#   bash uploadCloudFunction.sh orderFunctions    # 部署指定函数
#
# 等价 npm 命令:
#   npm run deploy:all                           # 部署所有
#   npm run deploy:baidu                         # 单个部署
# ==============================================================================

set -e

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 检查 wxcloud CLI
if ! command -v wxcloud >/dev/null 2>&1; then
  echo -e "${RED}错误: 未检测到 wxcloud CLI${NC}"
  echo "请先执行: npm install -g @wxcloud/cli"
  echo "或本地安装: npm install"
  exit 1
fi

# 读取环境 ID
ENV_ID=$(node -e "const e=require('./miniprogram/envList.js'); console.log((e.envList[0]||{}).env || '')")
if [ -z "$ENV_ID" ]; then
  echo -e "${RED}错误: 未配置云开发环境 ID${NC}"
  echo "请编辑 miniprogram/envList.js,设置:"
  echo "  module.exports = { envList: [{ env: 'your-env-id' }] }"
  exit 1
fi

echo -e "${GREEN}使用环境: ${ENV_ID}${NC}"

# 部署目标
CLOUDFUNCTIONS=(
  "baiduMap"
  "orderFunctions"
  "userFunctions"
  "matchFunctions"
  "wxpayFunctions"
  "quickstartFunctions"
)

# 过滤:只部署命令行指定的(若有)
if [ $# -gt 0 ]; then
  CLOUDFUNCTIONS=("$@")
fi

# 遍历部署
TOTAL=${#CLOUDFUNCTIONS[@]}
SUCCESS=0
FAILED=0

for i in "${!CLOUDFUNCTIONS[@]}"; do
  fn="${CLOUDFUNCTIONS[$i]}"
  echo ""
  echo -e "${YELLOW}[$((i+1))/$TOTAL] 部署: $fn${NC}"

  if [ ! -d "cloudfunctions/$fn" ]; then
    echo -e "${RED}  ✘ 目录不存在: cloudfunctions/$fn${NC}"
    FAILED=$((FAILED + 1))
    continue
  fi

  # 部署
  if wxcloud functions deploy -e "$ENV_ID" -n "$fn" -r --project "$PROJECT_ROOT"; then
    echo -e "${GREEN}  ✓ 部署成功${NC}"
    SUCCESS=$((SUCCESS + 1))
  else
    echo -e "${RED}  ✘ 部署失败${NC}"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "============================================="
echo -e "${GREEN}成功: $SUCCESS${NC}  ${RED}失败: $FAILED${NC}  ${YELLOW}总计: $TOTAL${NC}"
echo "============================================="

if [ $FAILED -gt 0 ]; then
  exit 1
fi
