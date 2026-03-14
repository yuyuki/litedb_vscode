// Constants used throughout the application

export const EXTENSION_CONSTANTS = {
    // Timeouts
    BRIDGE_RESPONSE_TIMEOUT: 10000,
    BRIDGE_RESTART_DELAY: 500,
    RETRY_DELAY: 100,
    
    // Cache settings
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    
    // Limits
    MAX_RETRY_COUNT: 1,
    OUTPUT_BUFFER_SIZE: 60 * 1024, // 60KB
} as const;

export const LITEDB_KEYWORDS = [
    'EXPLAIN', 'SELECT', 'INTO', 'FROM', 'INCLUDE', 'WHERE', 
    'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET', 
    'FOR UPDATE', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE'
] as const;

export const LITEDB_FUNCTIONS = [
    // Aggregate
    'COUNT', 'MIN', 'MAX', 'FIRST', 'LAST', 'AVG', 'SUM', 'ANY',
    // Special values
    'MINVALUE', 'MAXVALUE', 'OBJECTID', 'GUID', 'NOW', 'NOW_UTC', 'TODAY',
    // Type conversion
    'INT32', 'INT64', 'DOUBLE', 'DECIMAL', 'STRING', 'BINARY', 
    'BOOLEAN', 'DATETIME', 'DATETIME_UTC',
    // Type checking
    'IS_MINVALUE', 'IS_MAXVALUE', 'IS_NULL', 'IS_INT32', 'IS_INT64', 
    'IS_DOUBLE', 'IS_DECIMAL', 'IS_NUMBER', 'IS_STRING', 'IS_DOCUMENT', 
    'IS_ARRAY', 'IS_BINARY', 'IS_OBJECTID', 'IS_GUID', 'IS_BOOLEAN', 
    'IS_DATETIME',
    // Date functions
    'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 
    'DATEADD', 'DATEDIFF', 'TO_LOCAL', 'TO_UTC',
    // Math functions
    'ABS', 'ROUND', 'POW',
    // String functions
    'LOWER', 'UPPER', 'LTRIM', 'RTRIM', 'TRIM', 'INDEXOF', 
    'SUBSTRING', 'LPAD', 'RPAD', 'SPLIT', 'FORMAT', 'JOIN',
    // Other
    'JSON', 'EXTEND', 'CONCAT', 'KEYS', 'OID_CREATIONTIME', 
    'IIF', 'COALESCE', 'LENGTH', 'TOP', 'UNION', 'EXCEPT', 
    'DISTINCT', 'RANDOM'
] as const;

export const COMMAND_IDS = {
    OPEN_DATABASE: 'litedb.openDatabase',
    CLOSE_DATABASE: 'litedb.closeDatabase',
    RUN_QUERY: 'litedb.runQuery',
    REFRESH_COLLECTIONS: 'litedb.refreshCollections',
    OPEN_COLLECTION: 'litedb.openCollection',
    EXECUTE_SCRIPT: 'litedb.executeScript',
    HELP: 'litedb.help'
} as const;

export const VIEW_IDS = {
    EXPLORER: 'litedbExplorer',
    RESULT_VIEW: 'litedbResultView'
} as const;

export const DEFAULT_QUERY_TEMPLATE = '-- Enter your LiteDB SQL query here\n-- Press F5 to execute\n\n';
