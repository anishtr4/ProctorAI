// Question Bank for Coding Assessment
export const questions = [
    // JavaScript Questions
    {
        id: 1,
        language: "javascript",
        title: "Two Sum",
        difficulty: "Easy",
        description: `Given an array of integers \`nums\` and an integer \`target\`, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution.

**Example:**
\`\`\`
Input: nums = [2, 7, 11, 15], target = 9
Output: [0, 1]
Explanation: nums[0] + nums[1] = 2 + 7 = 9
\`\`\``,
        starterCode: `function twoSum(nums, target) {
  // Your code here
  
}

// Test
console.log(twoSum([2, 7, 11, 15], 9)); // Expected: [0, 1]`,
        timeLimit: 15 // minutes
    },
    {
        id: 2,
        language: "javascript",
        title: "Reverse String",
        difficulty: "Easy",
        description: `Write a function that reverses a string. The input string is given as an array of characters.

**Example:**
\`\`\`
Input: ["h","e","l","l","o"]
Output: ["o","l","l","e","h"]
\`\`\``,
        starterCode: `function reverseString(s) {
  // Modify array in-place
  
}

// Test
const arr = ["h","e","l","l","o"];
reverseString(arr);
console.log(arr); // Expected: ["o","l","l","e","h"]`,
        timeLimit: 10
    },
    {
        id: 3,
        language: "javascript",
        title: "Valid Parentheses",
        difficulty: "Medium",
        description: `Given a string containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.

Valid means:
- Open brackets must be closed by the same type
- Open brackets must be closed in the correct order

**Example:**
\`\`\`
Input: "()[]{}"
Output: true

Input: "([)]"
Output: false
\`\`\``,
        starterCode: `function isValid(s) {
  // Your code here
  
}

// Test
console.log(isValid("()[]{}")); // Expected: true
console.log(isValid("([)]"));   // Expected: false`,
        timeLimit: 15
    },

    // Python Questions
    {
        id: 4,
        language: "python",
        title: "Palindrome Check",
        difficulty: "Easy",
        description: `Write a function that checks if a given string is a palindrome (reads the same forwards and backwards).

Ignore case and non-alphanumeric characters.

**Example:**
\`\`\`
Input: "A man, a plan, a canal: Panama"
Output: True
\`\`\``,
        starterCode: `def is_palindrome(s):
    # Your code here
    pass

# Test
print(is_palindrome("A man, a plan, a canal: Panama"))  # Expected: True
print(is_palindrome("race a car"))  # Expected: False`,
        timeLimit: 10
    },
    {
        id: 5,
        language: "python",
        title: "FizzBuzz",
        difficulty: "Easy",
        description: `Print numbers 1 to n. But for multiples of 3 print "Fizz", for multiples of 5 print "Buzz", and for multiples of both print "FizzBuzz".

**Example:**
\`\`\`
Input: n = 15
Output: 1, 2, Fizz, 4, Buzz, Fizz, 7, 8, Fizz, Buzz, 11, Fizz, 13, 14, FizzBuzz
\`\`\``,
        starterCode: `def fizzbuzz(n):
    result = []
    # Your code here
    return result

# Test
print(fizzbuzz(15))`,
        timeLimit: 10
    },
    {
        id: 6,
        language: "python",
        title: "Find Duplicates",
        difficulty: "Medium",
        description: `Given an array of integers, find all duplicates that appear more than once.

**Example:**
\`\`\`
Input: [4, 3, 2, 7, 8, 2, 3, 1]
Output: [2, 3]
\`\`\``,
        starterCode: `def find_duplicates(nums):
    # Your code here
    pass

# Test
print(find_duplicates([4, 3, 2, 7, 8, 2, 3, 1]))  # Expected: [2, 3]`,
        timeLimit: 15
    },

    // Java Questions
    {
        id: 7,
        language: "java",
        title: "Fibonacci Sequence",
        difficulty: "Easy",
        description: `Write a function that returns the nth Fibonacci number.

The Fibonacci sequence: 0, 1, 1, 2, 3, 5, 8, 13, 21...

**Example:**
\`\`\`
Input: n = 6
Output: 8
\`\`\``,
        starterCode: `public class Solution {
    public static int fibonacci(int n) {
        // Your code here
        return 0;
    }
    
    public static void main(String[] args) {
        System.out.println(fibonacci(6)); // Expected: 8
    }
}`,
        timeLimit: 10
    },
    {
        id: 8,
        language: "java",
        title: "Binary Search",
        difficulty: "Medium",
        description: `Implement binary search to find a target value in a sorted array.

Return the index if found, otherwise return -1.

**Example:**
\`\`\`
Input: nums = [-1, 0, 3, 5, 9, 12], target = 9
Output: 4
\`\`\``,
        starterCode: `public class Solution {
    public static int binarySearch(int[] nums, int target) {
        // Your code here
        return -1;
    }
    
    public static void main(String[] args) {
        int[] nums = {-1, 0, 3, 5, 9, 12};
        System.out.println(binarySearch(nums, 9)); // Expected: 4
    }
}`,
        timeLimit: 15
    }
];

export function getQuestionsByLanguage(lang) {
    return questions.filter(q => q.language === lang);
}

export function getQuestionById(id) {
    return questions.find(q => q.id === id);
}
