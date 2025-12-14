import { RiskScore } from './components/types';

// ========================================
// ESCALA DE RISCO: 5 NÍVEIS
// ========================================
// 1 = Excelente (Verde)
// 2 = Bom (Azul)
// 3 = Médio (Amarelo)
// 4 = Alto (Laranja)
// 5 = Crítico (Vermelho)
// ========================================

export const RISK_COLORS: { [key in RiskScore | 0]: string } = {
  1: 'bg-green-500',   // 🟢 Verde #34A853 - Excelente
  2: 'bg-blue-500',    // 🔵 Azul #4285F4 - Bom
  3: 'bg-yellow-500',  // 🟡 Amarelo #FBBC05 - Médio
  4: 'bg-orange-600',  // 🟠 Laranja #FF6D00 - Alto
  5: 'bg-red-500',     // 🔴 Vermelho #EA4335 - Crítico
  0: 'bg-gray-200',    // Cinza (não usado, compatibilidade)
};

export const RISK_MEANING: { [key in RiskScore]: string } = {
  1: 'Excelente - Performance excepcional',
  2: 'Bom - Performance satisfatória',
  3: 'Médio - Pontos de atenção',
  4: 'Alto - Problemas significativos',
  5: 'Crítico - Situação grave',
};

export const RISK_LABELS: { [key in RiskScore]: string } = {
  1: 'Excelente',
  2: 'Bom',
  3: 'Médio',
  4: 'Alto',
  5: 'Crítico',
};

// --- APP IDENTITY & CONFIGURATION ---
export const APP_TITLE = "RMS-RAISA.ai";
export const APP_SUBTITLE = "AI-Powered Recruitment & Risk Management Platform";
export const APP_VERSION = "V2.6";
export const COMPANY_NAME = "TECH FOR TI";
// Variable AI Model
export const AI_MODEL_NAME = "gemini-2.5-flash"; 

// Base64 encoded logo (Placeholder - keeping existing one or updating if provided, using existing for stability)
export const LOGO_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEsAAAAcCAYAAAA7AaGBAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAARpSURBVHgB7VpZbtpQFH1m0h9g9x8g94/gHqD3B+k3sHsG1CdAnwB9AvUJ2B6g9wbpJ6B7hgnQhWq3XeezZ3Ym2aRIVNo0iWSp9N537j1FzDAMu0zT7D+P41hWfZZl2fL4fF4eDAaX42m12v/3F7N5aK35tG3btqZpvttJ5nl+1n3b9tOYz+fnYDA4xGPhcDj0Nqg7S0gIWmuV5/n1tOCWdMnlctVut1tPTmDA6/X6TafTfq52u11LkmQ0n5mZ1rqubZpmybIs27ZtpNFo9BsbDAbPTUxM/OM43uV5/j00gL3+XfV6vS7LsqLrfB2uO5cEAZIkOzo5mZkURZEniWnB02h7m4dZlhUAMJ/PPw5cM7dIJpPz17NUKv04jtvm6XZ/m3Q6Pdvtdhfmz4/HY453Op3WNE3LsmzZto1oZmdm2i2C4L3wA7ZtW5Fl2bZtGz8+Pz/e8o6f8Tw+ny+VSgUAGAwG55iZ+eM43uV5/v0A9wJ6MpmcTqfTn8fxeDw2TdP0sVwuVwBApVLp9Xo9T05Wq1WYmY1NT4Ig2LZtG6t1Op2tVCq994D8t5vYto3/aDKZfL1eT7VabQYAk8n0ZDI5ff14SgqZmVXrun48juM5T9M0T7VabZ42nZ2d3q35vV7vE9eH2k6n07+P43j4MzkZf3p6uv0UAIODg2d3d/d0tVq9x3E8ff12u11LkmQ0n5mZ1rqubZpmybIs27ZtpNFo9BsbDAbPTUxM/OM43uV5/j0kBDk5Od22rV+/fv3169fXrl377t27X6/XO8/z3yRJ8kZWVlZ+sVg8f/LkydGjR7/77rsfPHhw8eLFizMzM1+v14PhS/Qc4w9+8IMDAwOfvXjxYnh4+MTERLvdbtVqNRqNvnr16pVKhbW1tVqt1oMPPni+fPnydDrd6XTS6XQymUwqlX744YcPHDjwxIkT/+ijj/z+97/ft2/ft27eBgYHt7e1KpVIoFCYmJlZWVg4ODn7zm9/s7Oz85JNP/uijj/z+97/ft2/ft27eBgYHt7e1KpVIoFCYmJlZWVg4ODn7zm9/s7Oz85JNP/uijj/z+97/ft2/fiRMncnJyXq/X8/wU/+QpKYwxgiCIOI7DMMRisQwODkZERFy6dOnSpUtffvnlmZmZJ0+enEwmlUrlyJEjb7/99tWrV7958+Z7772XnZ19//79TU1NV69eXbVatbCw8MMPPzwyMnLixIkHDhzIysra2tp6/vw5TdM4jjsej5WVlUOHDr3zzjvv3bt3/vz558+fL5VKZTKZZDIZhiGZTA4ODt67d+9///vf12q1d+/e3dra+ttvv83LywsGg2EYBkajkWVZWVk5ODgIggCAOI5SqWRZWllZOTg4WFpaOTg4ODk5uXbt2tWrV/f19XV1df36666+/cePGH/7whwMDA3v37v3www9LkqRSqUwmk1QqhWGITqcDgGAwaGtr65133rlx48aNGzeysrIKBcL//g+r0Wjyv1kK9gAAAABJRU5ErkJggg==';

