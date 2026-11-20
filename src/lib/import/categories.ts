/**
 * 账单分类猜测。
 *
 * 支付宝/微信账单本身带「交易分类」「交易类型」「商品说明」这类文本，
 * 先按关键词映射到 App 的 18 个内置分类；映射不到就落到「其他」，
 * 导入后用户仍可以在明细里改。
 *
 * 关键词按优先级从具体到宽泛排列：先匹配到的赢。
 */
import type { TxType } from '../../types'

interface KeywordRule {
  categoryId: string
  keywords: string[]
}

const EXPENSE_RULES: KeywordRule[] = [
  { categoryId: 'food', keywords: ['餐饮', '美食', '外卖', '咖啡', '奶茶', '火锅', '烧烤', '早餐', '午餐', '晚餐', '夜宵', '食品', '餐厅', '饭店', '食堂', '星巴克', '麦当劳', '肯德基', '瑞幸', '蜜雪', '喜茶', '奈雪', '汉堡', '面包', '便利店'] },
  { categoryId: 'transport', keywords: ['交通', '打车', '滴滴', '地铁', '公交', '出租', '加油', '停车', '高铁', '火车', '机票', '航空', '单车', '哈啰', '车费', '过路费', '充电桩'] },
  { categoryId: 'shopping', keywords: ['购物', '淘宝', '天猫', '京东', '拼多多', '超市', '商场', '百货', '服饰', '服装', '鞋', '化妆品', '护肤', '数码', '电器', '苏宁', '盒马', '沃尔玛', '永辉', '日用品', '日用百货'] },
  { categoryId: 'home', keywords: ['房租', '物业', '水费', '电费', '燃气', '暖气', '住房', '家居', '装修', '家政'] },
  { categoryId: 'fun', keywords: ['娱乐', '电影', '游戏', '演出', '门票', '会员', '视频', '音乐', 'ktv', '酒吧', '网吧', '剧本杀'] },
  { categoryId: 'health', keywords: ['医疗', '医院', '药店', '挂号', '体检', '药', '诊所', '牙科'] },
  { categoryId: 'study', keywords: ['学习', '教育', '培训', '课程', '图书', '书店', '学费', '文具'] },
  { categoryId: 'social', keywords: ['人情', '礼物', '礼金', '红包', '转账给', '随礼'] },
  { categoryId: 'travel', keywords: ['旅行', '旅游', '酒店', '民宿', '携程', '去哪儿', '飞猪', '景区', '住宿'] },
  { categoryId: 'pet', keywords: ['宠物', '猫粮', '狗粮', '宠物医院', '铲屎'] },
  { categoryId: 'phone', keywords: ['通讯', '话费', '流量', '宽带', '移动', '联通', '电信', '充值'] },
  { categoryId: 'other', keywords: ['商业服务', '公共服务', '生活服务', '其他'] },
]

const INCOME_RULES: KeywordRule[] = [
  { categoryId: 'invest', keywords: ['理财', '基金', '利息', '收益', '分红', '余额宝', '股票', '定期'] },
  { categoryId: 'reimburse', keywords: ['报销', '退款', '退回', '退还'] },
  { categoryId: 'bonus', keywords: ['奖金', '年终奖', '绩效', '奖励'] },
  { categoryId: 'side', keywords: ['兼职', '工资', '薪资', '薪酬', '劳务', '实习', '稿费'] },
  { categoryId: 'redpacket', keywords: ['红包', '压岁钱', '礼金'] },
  { categoryId: 'other-income', keywords: ['转账', '收款', '其他'] },
]

/** 猜一个分类；猜不到返回 null，由调用方落到「其他」 */
export function guessCategoryId(type: TxType, ...texts: string[]): string | null {
  const haystack = texts.join(' ')
  if (!haystack.trim()) return null
  const rules = type === 'income' ? INCOME_RULES : EXPENSE_RULES
  for (const rule of rules) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) return rule.categoryId
  }
  return null
}
