interface SmartDesignOptions {
  verbose?: boolean;
  query?: string;
}

interface ToolResult {
  success: boolean;
  message?: string;
  error?: string;
  results?: any;
}

export default async function smartDesignTest(options: SmartDesignOptions = {}): Promise<ToolResult> {
  const { verbose = false, query = 'sample query' } = options;
  if (verbose) {
    console.log('Testing smart_design function...');
  }

  try {
    const result = await smart_design(query);
    if (verbose) {
      console.log('smart_design result:', result);
    }
    const parsed = JSON.parse(result);
    const valid = Array.isArray(parsed) && parsed.length > 0 && parsed.every(u => typeof u === 'string');
    return {
      success: valid,
      message: valid ? 'smart_design returned valid results' : 'smart_design returned invalid data',
      results: parsed,
      error: valid ? undefined : 'Invalid output format',
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
